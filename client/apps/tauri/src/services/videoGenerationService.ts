import type { HelperCommandResult, HelperEvent } from "@/domain/helper-protocol";
import type {
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import {
  createSummaryVideoGenerationComposition,
  createVideoGenerationManifest,
  type VideoGenerationComposition,
  type VideoGenerationRender,
  type VideoGenerationStoryboardScene,
} from "@/domain/video-generation";
import { invoke } from "@tauri-apps/api/core";
import { FakeHelperClient, type HelperClient } from "@/services/fakeHelperClient";
import {
  canUseTauriRuntime,
  TauriHelperClient,
  type TauriInvoke,
} from "@/services/tauriHelperClient";

export type VideoGenerationRuntimeStatus = Extract<
  HelperCommandResult,
  { command: "inspect_video_generation_runtime" }
>;

export type GenerateVideoCompositionRequest = {
  asset: VideoAsset;
  summary?: SummaryDocument;
  transcript?: TranscriptSegment[];
  prompt?: string;
  componentNames?: string[];
  storyboard?: VideoGenerationStoryboardScene[];
};

export type RenderVideoCompositionRequest = {
  composition: VideoGenerationComposition;
  onEvent?: (event: HelperEvent) => void;
};

export type VideoGenerationService = {
  inspectRuntime(): Promise<VideoGenerationRuntimeStatus>;
  generateComposition(
    request: GenerateVideoCompositionRequest,
  ): Promise<VideoGenerationComposition>;
  renderComposition(
    request: RenderVideoCompositionRequest,
  ): Promise<VideoGenerationRender>;
};

type WriteTextArtifactResult = {
  libraryRelativePath: string;
  targetPath: string;
  bytesWritten: number;
};

export function createVideoGenerationService({
  helperClient = canUseTauriRuntime()
    ? new TauriHelperClient()
    : new FakeHelperClient(),
  invokeCommand = invoke,
}: {
  helperClient?: HelperClient;
  invokeCommand?: TauriInvoke;
} = {}): VideoGenerationService {
  return {
    async inspectRuntime() {
      return await helperClient.run({
        protocolVersion: 1,
        command: "inspect_video_generation_runtime",
        jobId: createJobId("inspect"),
      }) as VideoGenerationRuntimeStatus;
    },

    async generateComposition(request) {
      const composition = createSummaryVideoGenerationComposition(request);

      if (canUseTauriRuntime()) {
        await writeTextArtifact(invokeCommand, composition.entryPath, composition.html);
        await writeTextArtifact(
          invokeCommand,
          composition.manifestPath,
          `${JSON.stringify(createVideoGenerationManifest(composition), null, 2)}\n`,
        );
      }

      return composition;
    },

    async renderComposition({ composition, onEvent }) {
      const result = await helperClient.run({
        protocolVersion: 1,
        command: "render_html_composition",
        jobId: createJobId("render"),
        inputPath: composition.entryPath,
        outputPath: composition.renderPath,
        tempDir: composition.renderPath.replace(/\/[^/]+$/, "/tmp"),
      }, {
        onEvent,
      });

      if (result.command !== "render_html_composition") {
        throw new Error("video_generation_unexpected_render_result");
      }

      return {
        id: createRenderId(composition.id),
        compositionId: composition.id,
        sourceId: composition.sourceId,
        adapter: composition.adapter,
        outputPath: result.videoPath,
        createdAtIso: new Date().toISOString(),
      };
    },
  };
}

async function writeTextArtifact(
  invokeCommand: TauriInvoke,
  relativePath: string,
  text: string,
) {
  return await invokeCommand<WriteTextArtifactResult>("write_text_artifact", {
    relativePath,
    text,
  });
}

function createJobId(prefix: string) {
  return `video-generation-${prefix}-${Date.now()}`;
}

function createRenderId(compositionId: string) {
  return `${compositionId}-render-${Date.now()}`;
}
