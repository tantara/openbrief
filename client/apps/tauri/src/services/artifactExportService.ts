import { invoke } from "@tauri-apps/api/core";
import type { HelperClient } from "@/services/fakeHelperClient";
import { TauriHelperClient, type TauriInvoke } from "@/services/tauriHelperClient";
import {
  createLocalFileDialogService,
  type LocalFileDialogService,
  type SaveFileDialogRequest,
} from "@/services/localFileDialogService";
import {
  createTranscriptArtifactPath,
  formatTranscriptText,
} from "@/domain/transcript-actions";
import type {
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import {
  createLibraryAssetDirectory,
  createMediaAssetFilePrefix,
  createVideoAudioArtifactPath,
  createVideoPosterArtifactPath,
  mediaSourceTypeForAsset,
  sanitizePathSegment,
} from "@/domain/media-library";
import { helperProtocolVersion } from "@/domain/helper-protocol";
import {
  logRuntimeError,
  logRuntimeInfo,
} from "@/services/runtimeLogger";

export type VideoArtifactDownloadKind =
  | "video"
  | "pdf"
  | "thumbnail"
  | "audio"
  | "transcription"
  | "summary";

export type ArtifactExportResult = {
  targetPath: string;
  sourceRelativePath: string;
  bytesWritten: number;
};

type MarkdownSaveResult = {
  targetPath: string;
  libraryRelativePath: string;
  bytesWritten: number;
};

export type ArtifactExportService = {
  exportVideoArtifact(request: {
    video: VideoAsset;
    transcript?: TranscriptSegment[];
    summary?: SummaryDocument;
    kind: VideoArtifactDownloadKind;
  }): Promise<ArtifactExportResult | undefined>;
  exportLibraryArtifact(request: {
    sourceRelativePath: string;
    defaultFileName: string;
    label: string;
    filters?: SaveFileDialogRequest["filters"];
  }): Promise<ArtifactExportResult | undefined>;
};

export function createArtifactExportService({
  invokeCommand = invoke,
  helperClient = new TauriHelperClient(invokeCommand),
  fileDialogService = createLocalFileDialogService(),
}: {
  invokeCommand?: TauriInvoke;
  helperClient?: HelperClient;
  fileDialogService?: LocalFileDialogService;
} = {}): ArtifactExportService {
  return {
    async exportLibraryArtifact({
      sourceRelativePath,
      defaultFileName,
      label,
      filters,
    }) {
      const targetPath = await fileDialogService.selectSavePath({
        title: `Export ${label}`,
        defaultPath: defaultFileName,
        filters,
      });

      if (!targetPath) {
        return undefined;
      }

      const { outputDirectory, fileName } = splitExportTargetPath(targetPath);
      logRuntimeInfo("before exporting artifact", {
        kind: label,
        sourceRelativePath,
        outputDirectory,
        fileName,
      });

      try {
        const result = await invokeCommand<ArtifactExportResult>(
          "export_library_artifact",
          {
            sourceRelativePath,
            outputDirectory,
            fileName,
          },
        );
        logRuntimeInfo("after exporting artifact", {
          kind: label,
          status: "success",
          sourceRelativePath,
          targetPath: result.targetPath,
          bytesWritten: result.bytesWritten,
        });
        return result;
      } catch (error) {
        logRuntimeError("after exporting artifact", {
          kind: label,
          status: "failed",
          sourceRelativePath,
          outputDirectory,
          fileName,
          error: caughtErrorMessage(error, "artifact_export_failed"),
        });
        throw error;
      }
    },

    async exportVideoArtifact({ video, transcript, summary, kind }) {
      if (kind === "transcription" && (!transcript || transcript.length === 0)) {
        throw new Error("transcription_export_unavailable");
      }
      if (kind === "summary" && !summary?.artifactPath) {
        throw new Error("summary_export_unavailable");
      }

      const defaultFileName = defaultExportFileName(video, kind, summary);
      const targetPath = await fileDialogService.selectSavePath({
        title: `Export ${artifactKindLabel(kind)}`,
        defaultPath: defaultFileName,
        filters: [artifactFileFilter(kind, defaultFileName)],
      });

      if (!targetPath) {
        return undefined;
      }

      const { outputDirectory, fileName } = splitExportTargetPath(targetPath);
      const sourceRelativePath = await sourceRelativePathForArtifact(
        video,
        transcript,
        summary,
        kind,
        helperClient,
        invokeCommand,
      );

      if (kind === "transcription" && transcript) {
        await invokeCommand<MarkdownSaveResult>("write_text_artifact", {
          relativePath: sourceRelativePath,
          text: formatTranscriptText(transcript),
        });
      } else if (kind === "summary" && summary) {
        await invokeCommand<MarkdownSaveResult>("write_text_artifact", {
          relativePath: sourceRelativePath,
          text: summary.markdown,
        });
      }

      logRuntimeInfo("before exporting artifact", {
        videoId: video.id,
        kind,
        sourceRelativePath,
        outputDirectory,
        fileName,
      });

      try {
        const result = await invokeCommand<ArtifactExportResult>(
          "export_library_artifact",
          {
            sourceRelativePath,
            outputDirectory,
            fileName,
          },
        );
        logRuntimeInfo("after exporting artifact", {
          videoId: video.id,
          kind,
          status: "success",
          sourceRelativePath,
          targetPath: result.targetPath,
          bytesWritten: result.bytesWritten,
        });
        return result;
      } catch (error) {
        logRuntimeError("after exporting artifact", {
          videoId: video.id,
          kind,
          status: "failed",
          sourceRelativePath,
          outputDirectory,
          fileName,
          error: caughtErrorMessage(error, "artifact_export_failed"),
        });
        throw error;
      }
    },
  };
}

function caughtErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

async function sourceRelativePathForArtifact(
  video: VideoAsset,
  transcript: TranscriptSegment[] | undefined,
  summary: SummaryDocument | undefined,
  kind: VideoArtifactDownloadKind,
  helperClient: HelperClient,
  invokeCommand: TauriInvoke,
) {
  if (kind === "video") {
    return video.libraryPath;
  }

  if (kind === "pdf") {
    if (mediaSourceTypeForAsset(video) !== "pdf") {
      throw new Error("pdf_export_unavailable");
    }

    return video.libraryPath;
  }

  if (kind === "thumbnail") {
    if (video.thumbnailPath) {
      return video.thumbnailPath;
    }

    const outputPath = createVideoPosterArtifactPath(
      video.id,
      video.originalFileName ?? video.title,
    );
    const result = await helperClient.run({
      protocolVersion: helperProtocolVersion,
      command: "extract_thumbnail",
      jobId: `export-thumbnail-${video.id}`,
      videoPath: video.libraryPath,
      outputPath,
      tempDir: createLibraryAssetDirectory("job-temp", video.id),
    });

    if (result.command !== "extract_thumbnail") {
      throw new Error("thumbnail_export_failed");
    }

    return result.thumbnailPath;
  }

  if (kind === "transcription") {
    if (!transcript || transcript.length === 0) {
      throw new Error("transcription_export_unavailable");
    }

    return createTranscriptArtifactPath(video, "transcription");
  }

  if (kind === "summary") {
    if (!summary?.artifactPath) {
      throw new Error("summary_export_unavailable");
    }

    return summary.artifactPath;
  }

  const sourceType = mediaSourceTypeForAsset(video);
  if (sourceType === "audio") {
    return video.libraryPath;
  }

  if (sourceType !== "video") {
    throw new Error("audio_export_unavailable");
  }

  const outputPath = createVideoAudioArtifactPath(
    video.id,
    video.originalFileName ?? video.title,
  );
  if (await libraryArtifactExists(outputPath, invokeCommand)) {
    return outputPath;
  }

  const result = await helperClient.run({
    protocolVersion: helperProtocolVersion,
    command: "extract_audio",
    jobId: `export-audio-${video.id}`,
    videoPath: video.libraryPath,
    outputPath,
    tempDir: createLibraryAssetDirectory("job-temp", video.id),
  });

  if (result.command !== "extract_audio") {
    throw new Error("audio_export_failed");
  }

  return result.audioPath;
}

async function libraryArtifactExists(
  relativePath: string,
  invokeCommand: TauriInvoke,
) {
  try {
    await invokeCommand<string>("resolve_library_file_path", { relativePath });
    return true;
  } catch {
    return false;
  }
}

function defaultExportFileName(
  video: VideoAsset,
  kind: VideoArtifactDownloadKind,
  summary: SummaryDocument | undefined,
) {
  if (kind === "audio") {
    if (mediaSourceTypeForAsset(video) === "audio") {
      return video.originalFileName ?? fileNameFromPath(video.libraryPath);
    }

    return `${createMediaAssetFilePrefix(video)}-audio.wav`;
  }

  if (kind === "summary") {
    return summary
      ? `${createMediaAssetFilePrefix(video)}-${sanitizePathSegment(summary.id)}.md`
      : `${createMediaAssetFilePrefix(video)}.md`;
  }

  if (kind === "transcription") {
    return `${createMediaAssetFilePrefix(video)}-transcription.txt`;
  }

  if (kind === "thumbnail") {
    return video.thumbnailPath
      ? fileNameFromPath(video.thumbnailPath)
      : fileNameFromPath(
          createVideoPosterArtifactPath(
            video.id,
            video.originalFileName ?? video.title,
          ),
        );
  }

  return fileNameFromPath(video.libraryPath);
}

function fileNameFromPath(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? "openbrief-artifact";
}

function artifactKindLabel(kind: VideoArtifactDownloadKind) {
  switch (kind) {
    case "video":
      return "video";
    case "pdf":
      return "PDF";
    case "thumbnail":
      return "thumbnail";
    case "audio":
      return "audio";
    case "transcription":
      return "transcription";
    case "summary":
      return "summary";
  }
}

function artifactFileFilter(
  kind: VideoArtifactDownloadKind,
  defaultFileName: string,
) {
  const extension = fileExtension(defaultFileName);

  if (kind === "video") {
    return {
      name: "Video",
      extensions: extension ? [extension] : ["mp4", "m4v", "mov", "webm", "mkv"],
    };
  }

  if (kind === "pdf") {
    return {
      name: "PDF",
      extensions: extension ? [extension] : ["pdf"],
    };
  }

  if (kind === "thumbnail") {
    return {
      name: "Image",
      extensions: extension ? [extension] : ["jpg", "jpeg", "png", "webp"],
    };
  }

  if (kind === "audio") {
    return {
      name: "Audio",
      extensions: extension ? [extension] : ["wav"],
    };
  }

  if (kind === "transcription") {
    return {
      name: "Text",
      extensions: extension ? [extension] : ["txt"],
    };
  }

  return {
    name: "Markdown",
    extensions: extension ? [extension] : ["md"],
  };
}

function fileExtension(fileName: string) {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
  return match?.[1]?.toLowerCase();
}

function splitExportTargetPath(targetPath: string) {
  const slashIndex = Math.max(
    targetPath.lastIndexOf("/"),
    targetPath.lastIndexOf("\\"),
  );

  if (slashIndex < 0) {
    return {
      outputDirectory: ".",
      fileName: targetPath,
    };
  }

  return {
    outputDirectory: targetPath.slice(0, slashIndex) || ".",
    fileName: targetPath.slice(slashIndex + 1),
  };
}
