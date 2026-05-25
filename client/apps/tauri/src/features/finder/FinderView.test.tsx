import type {
  SummaryDocument,
  TranscriptSegment,
  VideoAsset,
  VideoLibraryQuery,
} from "@/domain/media-library";
import type { PodcastDocument } from "@/domain/podcast";
import { useState } from "react";
import { FinderView } from "@/features/finder/FinderView";
import { generateVideoThumbnail } from "@/services/browserThumbnail";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/browserThumbnail", () => ({
  generateVideoThumbnail: vi.fn(async () => "blob:generated-thumbnail"),
}));

const video: VideoAsset = {
  id: "video-1",
  title: "Architecture walkthrough",
  sourceKind: "local-file",
  originalUri: "file:///tmp/source.mp4",
  libraryPath: "videos/video-1/source.mp4",
  durationSeconds: 125,
  fileSizeBytes: 5 * 1024 * 1024,
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};
const videoWithThumbnail: VideoAsset = {
  ...video,
  id: "video-thumb",
  thumbnailPath: "videos/video-thumb/thumbnail/video-thumb-thumbnail.jpg",
  authorName: "Sample Creator",
  authorUrl: "https://www.youtube.com/@samplecreator",
};
const audio: VideoAsset = {
  ...video,
  id: "audio-1",
  title: "Interview audio",
  sourceType: "audio",
  originalUri: "file:///tmp/interview.mp3",
  libraryPath: "audio/audio-1/interview.mp3",
  durationSeconds: 185,
};
const pdf: VideoAsset = {
  ...video,
  id: "pdf-1",
  title: "Research paper",
  sourceType: "pdf",
  originalUri: "file:///tmp/research.pdf",
  libraryPath: "documents/pdf-1/research.pdf",
  durationSeconds: undefined,
  pageCount: 12,
};
const csv: VideoAsset = {
  ...video,
  id: "csv-1",
  title: "Revenue metrics",
  sourceType: "csv",
  originalUri: "file:///tmp/revenue.csv",
  libraryPath: "csvs/csv-1/revenue.csv",
  durationSeconds: undefined,
};

const defaultProps = {
  onImportLocalFile: vi.fn(),
  onImportYoutubeUrl: vi.fn(),
  onOpenVideo: vi.fn(),
};

function createPodcastDocument(videoId: string): PodcastDocument {
  return {
    schemaVersion: 1,
    id: `podcast-${videoId}`,
    sourceAssetId: videoId,
    mode: "podcast-summary",
    sourceKind: "current-summary",
    lengthMode: "default",
    provider: "openai",
    createdAtIso: "2026-05-21T00:00:00.000Z",
    script: {
      title: "Podcast",
      turns: [],
      markdown: "# Podcast\n",
    },
    tts: {
      modelId: "Supertone/supertonic-3",
      languageCode: "en",
      speakers: [],
    },
    artifacts: {
      rootDirectory: `videos/${videoId}/podcast/podcast-${videoId}`,
      manifestPath: `videos/${videoId}/podcast/podcast-${videoId}/podcast.json`,
      scriptPath: `videos/${videoId}/podcast/podcast-${videoId}/script.md`,
      podcastAudioPath: `videos/${videoId}/podcast/podcast-${videoId}/audio/podcast.wav`,
      turnAudioDirectory: `videos/${videoId}/podcast/podcast-${videoId}/audio/turns`,
      turnAudioPaths: [],
    },
  };
}

async function openDropdownMenu(name: RegExp) {
  const trigger = screen.getByRole("button", { name });
  fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
  return within(await screen.findByRole("menu"));
}

async function chooseSelectOption(name: RegExp, optionName: RegExp) {
  const trigger = screen.getByRole("combobox", { name });
  fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
}

describe("FinderView", () => {
  it("renders an empty state", () => {
    const onAddVideo = vi.fn();

    render(
      <FinderView videos={[]} {...defaultProps} onAddVideo={onAddVideo} />,
    );

    expect(screen.getByText(/add a local video/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^add video$/i }));

    expect(onAddVideo).toHaveBeenCalledTimes(1);
  });

  it("shows import and tutorial cards at the top", () => {
    const onOpenTutorial = vi.fn();

    render(
      <FinderView
        videos={[]}
        {...defaultProps}
        onOpenTutorial={onOpenTutorial}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /add video/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /how to use openbrief/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/download or import a video/i)).toBeInTheDocument();
    expect(
      screen.getByText(/generate a blog-style markdown summary/i),
    ).toBeInTheDocument();

    const tutorialLink = screen.getByRole("link", { name: /open tutorial/i });
    expect(tutorialLink).toHaveAttribute("href", "/tutorial");
    expect(tutorialLink).toHaveClass("px-3");
    expect(tutorialLink).not.toHaveClass("px-0");
    fireEvent.click(tutorialLink);
    expect(onOpenTutorial).toHaveBeenCalled();
  });

  it("opens the shared add video dialog from the no matches state", () => {
    const onAddVideo = vi.fn();

    render(
      <FinderView
        videos={[video]}
        {...defaultProps}
        query={{ searchText: "missing", page: 1 }}
        onAddVideo={onAddVideo}
      />,
    );

    expect(screen.getByText(/no videos match/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^add video$/i }));

    expect(onAddVideo).toHaveBeenCalledTimes(1);
  });

  it("renders video cards with key metadata", () => {
    const onPlayVideo = vi.fn();

    render(
      <FinderView
        videos={[videoWithThumbnail]}
        {...defaultProps}
        onPlayVideo={onPlayVideo}
      />,
    );

    expect(screen.getByText("Architecture walkthrough")).toBeInTheDocument();
    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.getByText("5.0 MB")).toBeInTheDocument();
    expect(screen.getByText("Video · ready")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sample creator/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("No transcript")).toBeInTheDocument();
    expect(screen.getByText("No summary")).toBeInTheDocument();
    expect(screen.getByTitle("Architecture walkthrough")).toHaveAttribute(
      "src",
      "videos/video-thumb/thumbnail/video-thumb-thumbnail.jpg",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /open architecture walkthrough/i }),
    );
    expect(defaultProps.onOpenVideo).toHaveBeenCalledWith("video-thumb");

    fireEvent.click(
      screen.getByRole("button", { name: /play architecture walkthrough/i }),
    );
    expect(onPlayVideo).toHaveBeenCalledWith("video-thumb");
  });

  it("uses the shared thumbnail area to play audio cards", () => {
    const onOpenVideo = vi.fn();
    const onPlayVideo = vi.fn();
    vi.mocked(generateVideoThumbnail).mockClear();

    render(
      <FinderView
        videos={[audio]}
        {...defaultProps}
        onOpenVideo={onOpenVideo}
        onPlayVideo={onPlayVideo}
      />,
    );

    expect(screen.getByText("Audio · ready")).toBeInTheDocument();
    expect(screen.getByText("3:05")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open interview audio/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /play interview audio/i }),
    );
    expect(onPlayVideo).toHaveBeenCalledWith("audio-1");
    expect(generateVideoThumbnail).not.toHaveBeenCalled();
  });

  it("hides video-only artifact downloads for audio cards", async () => {
    render(<FinderView videos={[audio]} {...defaultProps} />);

    const menu = await openDropdownMenu(
      /download artifacts for interview audio/i,
    );

    expect(menu.getByText("Audio")).toBeInTheDocument();
    expect(menu.queryByText("Video")).not.toBeInTheDocument();
    expect(menu.queryByText("Thumbnail")).not.toBeInTheDocument();
  });

  it("shows PDF page count as the library card content length", () => {
    render(<FinderView videos={[pdf]} {...defaultProps} />);

    expect(screen.getByText("PDF · ready")).toBeInTheDocument();
    expect(screen.getByText("12 pages")).toBeInTheDocument();
    expect(screen.queryByText("No transcript")).not.toBeInTheDocument();
  });

  it("shows the first PDF page as a top-cropped library thumbnail", () => {
    vi.mocked(generateVideoThumbnail).mockClear();

    render(<FinderView videos={[pdf]} {...defaultProps} />);

    const preview = screen.getByTitle("Research paper");
    expect(preview.tagName).toBe("IFRAME");
    expect(preview).toHaveAttribute(
      "src",
      "documents/pdf-1/research.pdf#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH",
    );
    expect(preview).toHaveClass("top-0");
    expect(generateVideoThumbnail).not.toHaveBeenCalled();
  });

  it("opens imported PDFs in Note from the inline library action", () => {
    const onOpenVideo = vi.fn();
    render(
      <FinderView videos={[pdf]} {...defaultProps} onOpenVideo={onOpenVideo} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /open research paper in note/i }),
    );

    expect(onOpenVideo).toHaveBeenCalledWith("pdf-1");
  });

  it("shows a PDF download choice from the PDF card", async () => {
    const onDownloadArtifact = vi.fn();
    render(
      <FinderView
        videos={[pdf]}
        {...defaultProps}
        onDownloadArtifact={onDownloadArtifact}
      />,
    );

    const menu = await openDropdownMenu(
      /download artifacts for research paper/i,
    );
    expect(menu.getByText("PDF")).toBeInTheDocument();
    expect(menu.queryByText("Video")).not.toBeInTheDocument();
    expect(menu.queryByText("Thumbnail")).not.toBeInTheDocument();
    expect(menu.queryByText("Audio")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /^pdf/i }));

    expect(onDownloadArtifact).toHaveBeenCalledWith(pdf, "pdf");
  });

  it("shows a CSV download choice from the CSV card", async () => {
    const onDownloadArtifact = vi.fn();
    const onOpenVideo = vi.fn();
    render(
      <FinderView
        videos={[csv]}
        {...defaultProps}
        onOpenVideo={onOpenVideo}
        onDownloadArtifact={onDownloadArtifact}
      />,
    );

    expect(screen.getByText("CSV · ready")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /open revenue metrics in note/i }),
    );
    expect(onOpenVideo).toHaveBeenCalledWith("csv-1");

    const menu = await openDropdownMenu(
      /download artifacts for revenue metrics/i,
    );
    expect(menu.getByText("CSV")).toBeInTheDocument();
    expect(menu.queryByText("Video")).not.toBeInTheDocument();
    expect(menu.queryByText("Thumbnail")).not.toBeInTheDocument();
    expect(menu.queryByText("Audio")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /^csv/i }));

    expect(onDownloadArtifact).toHaveBeenCalledWith(csv, "csv");
  });

  it("shows default download artifact choices from the video card", async () => {
    render(<FinderView videos={[videoWithThumbnail]} {...defaultProps} />);

    const menu = await openDropdownMenu(
      /download artifacts for architecture walkthrough/i,
    );
    expect(menu.getByText("Video")).toBeInTheDocument();
    expect(menu.getByText("Thumbnail")).toBeInTheDocument();
    expect(menu.getByText("Audio")).toBeInTheDocument();
    expect(menu.queryByText("Transcription")).not.toBeInTheDocument();
    expect(menu.queryByText("Summary")).not.toBeInTheDocument();
  });

  it("requests an output directory flow when downloading default artifacts", async () => {
    const onDownloadArtifact = vi.fn();
    render(
      <FinderView
        videos={[videoWithThumbnail]}
        {...defaultProps}
        onDownloadArtifact={onDownloadArtifact}
      />,
    );

    await openDropdownMenu(/download artifacts for architecture walkthrough/i);
    fireEvent.click(screen.getByRole("menuitem", { name: /^video/i }));

    expect(onDownloadArtifact).toHaveBeenCalledWith(
      videoWithThumbnail,
      "video",
    );
  });

  it("adds summary to download choices when a saved summary exists", async () => {
    const onDownloadArtifact = vi.fn();
    render(
      <FinderView
        videos={[videoWithThumbnail]}
        summariesByVideoId={{
          "video-thumb": {
            id: "summary-video-thumb",
            videoId: "video-thumb",
            markdown: "# Summary",
            provider: "openai",
            sourceSegmentCount: 1,
            artifactPath:
              "videos/video-thumb/summary/summary-video-thumb/summary.md",
            createdAtIso: "2026-05-21T00:00:00.000Z",
          },
        }}
        {...defaultProps}
        onDownloadArtifact={onDownloadArtifact}
      />,
    );

    const menu = await openDropdownMenu(
      /download artifacts for architecture walkthrough/i,
    );
    expect(menu.getByText("Summary")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /^summary/i }));

    expect(onDownloadArtifact).toHaveBeenCalledWith(
      videoWithThumbnail,
      "summary",
    );
  });

  it("opens an edit title dialog from the video action menu", async () => {
    const onRenameVideoTitle = vi.fn();
    render(
      <FinderView
        videos={[video]}
        {...defaultProps}
        onRenameVideoTitle={onRenameVideoTitle}
      />,
    );

    await openDropdownMenu(/video actions for architecture walkthrough/i);
    fireEvent.click(screen.getByRole("menuitem", { name: /edit title/i }));
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Updated architecture walkthrough" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save title/i }));

    expect(onRenameVideoTitle).toHaveBeenCalledWith(
      "video-1",
      "Updated architecture walkthrough",
    );
  });

  it("copies the original URL from the video action menu for remote imports", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const remoteVideo: VideoAsset = {
      ...video,
      sourceKind: "youtube",
      originalUri: "https://www.youtube.com/watch?v=abc123",
    };

    render(<FinderView videos={[remoteVideo]} {...defaultProps} />);

    await openDropdownMenu(/video actions for architecture walkthrough/i);
    const copyItem = screen.getByRole("menuitem", { name: /copy link/i });
    fireEvent.click(copyItem);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://www.youtube.com/watch?v=abc123",
      ),
    );
    await waitFor(() =>
      expect(copyItem).toHaveAttribute("data-copied", "true"),
    );
  });

  it("opens the original provider URL from the video action menu for remote imports", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const remoteVideo: VideoAsset = {
      ...video,
      sourceKind: "youtube",
      originalUri: "https://www.youtube.com/watch?v=abc123",
    };

    render(<FinderView videos={[remoteVideo]} {...defaultProps} />);

    await openDropdownMenu(/video actions for architecture walkthrough/i);
    fireEvent.click(screen.getByRole("menuitem", { name: /open youtube/i }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://www.youtube.com/watch?v=abc123",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    open.mockRestore();
  });

  it("opens the stored author URL from the card author action", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    render(<FinderView videos={[videoWithThumbnail]} {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /sample creator/i }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://www.youtube.com/@samplecreator",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    open.mockRestore();
  });

  it("hides provider link actions for desktop imports", async () => {
    render(<FinderView videos={[video]} {...defaultProps} />);

    const menu = await openDropdownMenu(
      /video actions for architecture walkthrough/i,
    );

    expect(
      menu.queryByRole("menuitem", { name: /open youtube/i }),
    ).not.toBeInTheDocument();
    expect(
      menu.queryByRole("menuitem", { name: /copy link/i }),
    ).not.toBeInTheDocument();
  });

  it("opens a delete confirmation dialog from the video action menu", async () => {
    const onDeleteVideo = vi.fn();
    render(
      <FinderView
        videos={[video]}
        {...defaultProps}
        onDeleteVideo={onDeleteVideo}
      />,
    );

    await openDropdownMenu(/video actions for architecture walkthrough/i);
    fireEvent.click(screen.getByRole("menuitem", { name: /^delete$/i }));

    const dialog = screen.getByRole("dialog", { name: /delete video/i });
    expect(
      within(dialog).getByText(/saved transcript, summary, and chat history/i),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    expect(onDeleteVideo).toHaveBeenCalledWith("video-1");
  });

  it("uses media-specific delete confirmation titles for imported audio and PDFs", async () => {
    render(<FinderView videos={[audio, pdf]} {...defaultProps} />);

    await openDropdownMenu(/audio actions for interview audio/i);
    fireEvent.click(screen.getByRole("menuitem", { name: /^delete$/i }));

    expect(
      screen.getByRole("dialog", { name: /delete audio/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await openDropdownMenu(/pdf actions for research paper/i);
    fireEvent.click(screen.getByRole("menuitem", { name: /^delete$/i }));

    const dialog = screen.getByRole("dialog", { name: /delete pdf/i });
    expect(
      within(dialog).getByText(/saved summary and chat history/i),
    ).toBeInTheDocument();
  });

  it("adds transcription and summary to download choices when they exist", async () => {
    const onDownloadArtifact = vi.fn();
    const transcript = [
      {
        id: "s1",
        startSeconds: 0,
        text: "Transcript",
        sourceKind: "local-stt" as const,
      },
    ];
    render(
      <FinderView
        videos={[video]}
        transcriptsByVideoId={{
          "video-1": transcript,
        }}
        summariesByVideoId={{
          "video-1": {
            id: "summary-video-1",
            videoId: "video-1",
            markdown: "# Summary",
            provider: "openai",
            sourceSegmentCount: 1,
            artifactPath: "videos/video-1/summary/summary-video-1/summary.md",
            createdAtIso: "2026-05-21T00:00:00.000Z",
          },
        }}
        {...defaultProps}
        onDownloadArtifact={onDownloadArtifact}
      />,
    );

    const menu = await openDropdownMenu(
      /download artifacts for architecture walkthrough/i,
    );
    expect(menu.getByText("Video")).toBeInTheDocument();
    expect(menu.getByText("Thumbnail")).toBeInTheDocument();
    expect(menu.getByText("Audio")).toBeInTheDocument();
    expect(menu.getByText("Transcription")).toBeInTheDocument();
    expect(menu.getByText("Summary")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /^transcription/i }));

    expect(onDownloadArtifact).toHaveBeenCalledWith(
      video,
      "transcription",
      transcript,
    );
  });

  it("generates a browser thumbnail when no stored thumbnail exists", async () => {
    render(<FinderView videos={[video]} {...defaultProps} />);

    await waitFor(() => {
      expect(generateVideoThumbnail).toHaveBeenCalledWith(
        "videos/video-1/source.mp4",
        expect.objectContaining({ isDestroyed: expect.any(Function) }),
      );
    });
    expect(screen.getByTitle("Architecture walkthrough")).toHaveAttribute(
      "src",
      "blob:generated-thumbnail",
    );
  });

  it("searches and filters videos by transcript and summary state", async () => {
    const secondVideo: VideoAsset = {
      ...video,
      id: "video-2",
      title: "Travel footage",
      sourceKind: "youtube",
      originalUri: "https://youtu.be/travel",
    };
    const transcriptsByVideoId: Record<string, TranscriptSegment[]> = {
      "video-1": [
        {
          id: "s1",
          startSeconds: 0,
          text: "Component boundaries and architecture",
          sourceKind: "local-stt",
        },
      ],
    };
    const summariesByVideoId: Record<string, SummaryDocument> = {
      "video-1": {
        id: "summary-video-1",
        videoId: "video-1",
        markdown: "# Architecture Summary",
        provider: "openai",
        sourceSegmentCount: 1,
        createdAtIso: "2026-05-21T00:00:00.000Z",
      },
    };
    const podcastsByVideoId: Record<string, PodcastDocument> = {
      "video-1": createPodcastDocument("video-1"),
    };

    function ControlledFinder() {
      const [query, setQuery] = useState<VideoLibraryQuery>({
        searchText: "component boundaries",
        sourceKind: "all",
        transcriptStatus: "all",
        summaryStatus: "all",
        podcastStatus: "all",
      });

      return (
        <FinderView
          videos={[video, secondVideo]}
          transcriptsByVideoId={transcriptsByVideoId}
          summariesByVideoId={summariesByVideoId}
          podcastsByVideoId={podcastsByVideoId}
          query={query}
          onQueryChange={setQuery}
          {...defaultProps}
        />
      );
    }

    render(<ControlledFinder />);

    fireEvent.click(screen.getByRole("button", { name: /with transcript/i }));
    fireEvent.click(screen.getByRole("button", { name: /with summary/i }));
    fireEvent.click(screen.getByRole("button", { name: /with podcast/i }));

    expect(screen.getByText("Architecture walkthrough")).toBeInTheDocument();
    expect(screen.queryByText("Travel footage")).not.toBeInTheDocument();
    expect(screen.queryByText("1 of 2")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/finder page/i)).toHaveTextContent("1/1");
  });

  it("sorts finder results by duration and file size", async () => {
    render(
      <FinderView
        videos={[
          {
            ...video,
            id: "small-short",
            title: "Small Short",
            durationSeconds: 10,
            fileSizeBytes: 10,
            createdAtIso: "2026-05-20T00:00:00.000Z",
          },
          {
            ...video,
            id: "large-medium",
            title: "Large Medium",
            durationSeconds: 20,
            fileSizeBytes: 30,
            createdAtIso: "2026-05-21T00:00:00.000Z",
          },
          {
            ...video,
            id: "medium-long",
            title: "Medium Long",
            durationSeconds: 30,
            fileSizeBytes: 20,
            createdAtIso: "2026-05-22T00:00:00.000Z",
          },
        ]}
        {...defaultProps}
      />,
    );

    await chooseSelectOption(/sort videos/i, /longest/i);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Medium Long", "Large Medium", "Small Short"]);

    await chooseSelectOption(/sort videos/i, /shortest/i);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Small Short", "Large Medium", "Medium Long"]);

    await chooseSelectOption(/sort videos/i, /largest/i);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Large Medium", "Medium Long", "Small Short"]);

    await chooseSelectOption(/sort videos/i, /smallest/i);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Small Short", "Medium Long", "Large Medium"]);

    await chooseSelectOption(/sort videos/i, /oldest/i);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Small Short", "Large Medium", "Medium Long"]);
  });

  it("paginates finder results at 24 videos per page", () => {
    const videos = Array.from({ length: 25 }, (_, index) => {
      const sequence = index + 1;

      return {
        ...video,
        id: `video-${sequence}`,
        title: `Video ${sequence.toString().padStart(2, "0")}`,
        createdAtIso: `2026-05-${sequence.toString().padStart(2, "0")}T00:00:00.000Z`,
      };
    });

    render(<FinderView videos={videos} {...defaultProps} />);

    expect(screen.queryByText("25 of 25")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/finder page/i)).toHaveTextContent("1/2");
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
    expect(screen.getByText("Video 25")).toBeInTheDocument();
    expect(screen.queryByText("Video 01")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByLabelText(/finder page/i)).toHaveTextContent("2/2");
    expect(
      screen.getByRole("button", { name: /previous/i }),
    ).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.getByText("Video 01")).toBeInTheDocument();
    expect(screen.queryByText("Video 25")).not.toBeInTheDocument();
  });

  it("submits local and YouTube ingest requests", async () => {
    const onImportLocalFile = vi.fn().mockResolvedValue(undefined);
    const onImportYoutubeUrl = vi.fn().mockResolvedValue(undefined);
    const fileDialogService = {
      selectVideoFile: vi.fn().mockResolvedValue("/tmp/source.mp4"),
      selectImageFile: vi.fn(),
      selectSavePath: vi.fn(),
    };

    render(
      <FinderView
        videos={[]}
        onImportLocalFile={onImportLocalFile}
        onImportYoutubeUrl={onImportYoutubeUrl}
        onOpenVideo={vi.fn()}
        fileDialogService={fileDialogService}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /select from computer/i }),
    );

    await waitFor(() => {
      expect(fileDialogService.selectVideoFile).toHaveBeenCalled();
      expect(onImportLocalFile).toHaveBeenCalledWith("/tmp/source.mp4");
    });

    fireEvent.change(screen.getByLabelText(/video url/i), {
      target: { value: "https://youtu.be/example" },
    });
    expect(screen.getByText("YouTube · single video")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => {
      expect(onImportYoutubeUrl).toHaveBeenCalledWith(
        "https://youtu.be/example",
      );
    });
  });

  it("renders ingest job progress and rejection messages", async () => {
    const onRemoveFailedIngestJob = vi.fn();
    const onDownloadRecoveryAction = vi.fn();
    const onImportYoutubeUrl = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const failedJob = {
      id: "job-1",
      sourceKind: "youtube" as const,
      status: "failed" as const,
      progressPercent: 0,
      title: "https://www.youtube.com/watch?v=ocFailId01",
      originalUri: "https://www.youtube.com/watch?v=ocFailId01",
      errorMessage:
        "Playlist, channel, profile, and collection imports are not supported in v1",
      recoveryActions: [
        {
          kind: "provide-cookies" as const,
          label: "Use cookies",
          description: "Choose a cookies.txt file exported from a browser.",
        },
      ],
    };

    render(
      <FinderView
        videos={[]}
        ingestJobs={[failedJob]}
        {...defaultProps}
        onRemoveFailedIngestJob={onRemoveFailedIngestJob}
        onDownloadRecoveryAction={onDownloadRecoveryAction}
        onImportYoutubeUrl={onImportYoutubeUrl}
      />,
    );

    expect(screen.getAllByText("youtube").length).toBeGreaterThan(0);
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Playlist, channel, profile, and collection imports are not supported in v1",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /use cookies/i }));
    expect(onDownloadRecoveryAction).toHaveBeenCalledWith(
      failedJob,
      "provide-cookies",
    );

    const copyButton = screen.getByRole("button", {
      name: /copy failed download url/i,
    });
    fireEvent.click(copyButton);
    expect(writeText).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=ocFailId01",
    );
    await waitFor(() =>
      expect(copyButton).toHaveAttribute("data-copied", "true"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /retry failed download/i }),
    );
    expect(onImportYoutubeUrl).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=ocFailId01",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /remove failed import/i }),
    );

    expect(onRemoveFailedIngestJob).toHaveBeenCalledWith("job-1");
  });

  it("hides completed ingest jobs from the Finder queue", () => {
    render(
      <FinderView
        videos={[]}
        ingestJobs={[
          {
            id: "job-completed",
            sourceKind: "youtube",
            status: "completed",
            progressPercent: 100,
            title: "Completed import",
            originalUri: "https://www.youtube.com/watch?v=ocDoneId01",
          },
          {
            id: "job-running",
            sourceKind: "youtube",
            status: "running",
            progressPercent: 42,
            title: "Running import",
          },
        ]}
        {...defaultProps}
      />,
    );

    expect(screen.queryByText("Completed import")).not.toBeInTheDocument();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(screen.getByText("Running import")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("lets users cancel queued or running ingest jobs", () => {
    const onCancelIngestJob = vi.fn().mockResolvedValue(undefined);

    render(
      <FinderView
        videos={[]}
        ingestJobs={[
          {
            id: "job-1",
            sourceKind: "youtube",
            status: "running",
            progressPercent: 42,
            title: "Downloading video",
          },
        ]}
        onCancelIngestJob={onCancelIngestJob}
        {...defaultProps}
      />,
    );

    expect(screen.getByText("42%")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /cancel youtube download/i }),
    );

    expect(onCancelIngestJob).toHaveBeenCalledWith("job-1");
  });

  it.each([
    [
      "TikTok",
      "https://www.tiktok.com/@samplecreator/video/7320000000000000000",
    ],
    ["Twitch", "https://www.twitch.tv/videos/123456789"],
    ["Vimeo", "https://vimeo.com/123456789"],
  ])("shows a %s provider badge below the URL form", (label, url) => {
    render(<FinderView videos={[]} {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/video url/i), {
      target: { value: url },
    });

    expect(screen.getByText(`${label} · single video`)).toBeInTheDocument();
  });
});
