import type {
  ChatMessage,
  SummaryDocument,
  TranscriptJob,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import type { PodcastDocument } from "@/domain/podcast";
import type { QuizDocument } from "@/domain/quiz";
import type { AiGenerationJob } from "@/hooks/useMediaLibrary";
import type { ComponentProps } from "react";
import {
  nextVoiceCloneTranscriptSegmentSelection,
  shortProviderModelName,
  WorkbenchView,
} from "@/features/workbench/WorkbenchView";
import { createInitialVideoPlaybackState } from "@/hooks/useVideoPlayback";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("WorkbenchView", () => {
  it("renders podcast controls and submits preset Supertonic speakers", async () => {
    const onGeneratePodcast = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summary: summaryFixture,
          onGeneratePodcast,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Podcast" }));
    fireEvent.click(screen.getByRole("button", { name: /generate podcast/i }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /generate podcast/i,
      }),
    );

    await waitFor(() => expect(onGeneratePodcast).toHaveBeenCalledTimes(1));
    expect(onGeneratePodcast).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "podcast-summary",
        sourceKind: "current-summary",
        lengthMode: "default",
        languageCode: "en",
        speakers: [
          expect.objectContaining({ id: "A", voiceStyleId: "M1" }),
          expect.objectContaining({ id: "B", voiceStyleId: "F2" }),
        ],
      }),
    );
  });

  it("switches the brief column to podcast audio and script turns", async () => {
    const onPauseVideo = vi.fn();
    const onPlayPodcast = vi.fn();
    const onDownloadPodcastAudio = vi.fn();
    const onDownloadPodcastScript = vi.fn();
    const onDeletePodcast = vi.fn();
    const audioPlay = vi
      .spyOn(window.HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const audioPause = vi
      .spyOn(window.HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});
    const { container } = render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summary: summaryFixture,
          podcast: podcastFixture,
          podcastHistory: [podcastFixture],
          podcastAudioUrl: "asset://podcast.wav",
          onPauseVideo,
          onPlayPodcast,
          onDownloadPodcastAudio,
          onDownloadPodcastScript,
          onDeletePodcast,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Podcast" }));

    const generateButton = screen.getByRole("button", {
      name: /generate podcast/i,
    });
    const podcastActions = generateButton.parentElement;
    expect(podcastActions).not.toBeNull();
    expect(
      within(podcastActions as HTMLElement).getByRole("button", {
        name: "Play",
      }),
    ).toBeInTheDocument();
    expect(
      within(podcastActions as HTMLElement).getByRole("button", {
        name: "Download podcast",
      }),
    ).toBeInTheDocument();
    expect(
      within(podcastActions as HTMLElement).getByRole("button", {
        name: "Delete",
      }),
    ).toBeInTheDocument();

    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(audio).toHaveAttribute("src", "asset://podcast.wav");

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(audioPlay).toHaveBeenCalledTimes(1);
    expect(onPlayPodcast).not.toHaveBeenCalled();

    fireEvent.play(audio);
    expect(onPauseVideo).toHaveBeenCalledWith("video-1");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

    fireEvent.seeking(audio);
    fireEvent.pause(audio);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(audioPlay).toHaveBeenCalledTimes(2);
    fireEvent.seeked(audio);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(audioPlay).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(audioPause).toHaveBeenCalledTimes(1);

    fireEvent.pause(audio);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Download podcast" }),
      {
        key: "Enter",
        code: "Enter",
      },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Download audio" }),
    );
    expect(onDownloadPodcastAudio).toHaveBeenCalledWith(podcastFixture);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Download podcast" }),
      {
        key: "Enter",
        code: "Enter",
      },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Download script" }),
    );
    expect(onDownloadPodcastScript).toHaveBeenCalledWith(podcastFixture);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDeletePodcast).toHaveBeenCalledWith(podcastFixture);

    const hostTurn = screen.getByRole("button", {
      name: /host.*0:00.*welcome to the brief/i,
    });
    const guestTurn = screen.getByRole("button", {
      name: /guest.*0:12.*here is the key point/i,
    });
    expect(hostTurn).toBeInTheDocument();
    expect(guestTurn).toBeInTheDocument();
    fireEvent.click(guestTurn);
    expect((audio as HTMLAudioElement).currentTime).toBe(12);
    fireEvent.timeUpdate(audio as HTMLAudioElement);
    expect(guestTurn).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Host")).toBeInTheDocument();
    expect(screen.getByText("Welcome to the brief.")).toBeInTheDocument();
    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.getByText("Here is the key point.")).toBeInTheDocument();

    audioPlay.mockRestore();
    audioPause.mockRestore();
  });

  it("renders quiz controls and submits the requested quiz shape", async () => {
    const onGenerateQuiz = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summary: summaryFixture,
          onGenerateQuiz,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Quiz" }));
    fireEvent.click(screen.getByRole("button", { name: /generate quiz/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Questions"), {
      target: { value: "8" },
    });
    fireEvent.change(within(dialog).getByLabelText("Area of interest"), {
      target: { value: "retrieval practice" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /generate quiz/i }),
    );

    await waitFor(() => expect(onGenerateQuiz).toHaveBeenCalledTimes(1));
    expect(onGenerateQuiz).toHaveBeenCalledWith({
      mode: "multiple-choice",
      questionCount: 8,
      areaOfInterest: "retrieval practice",
    });
  });

  it("reveals multiple-choice correctness after the student answers", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          quiz: quizFixture,
          quizHistory: [quizFixture],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Quiz" }));

    expect(screen.getByText("Workbench quiz")).toBeInTheDocument();
    expect(screen.getByText("What is the key point?")).toBeInTheDocument();
    expect(screen.queryByText("Not quite")).not.toBeInTheDocument();
    expect(
      screen.queryByText("The quiz is based on the current media."),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /the source is ignored/i }),
    );

    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(
      screen.getByText("Answer: The summary is grounded"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The quiz is based on the current media."),
    ).toBeInTheDocument();
  });

  it("reveals flash-card answers on request", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          quiz: flashCardQuizFixture,
          quizHistory: [flashCardQuizFixture],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Quiz" }));

    expect(screen.getByText("Define grounding.")).toBeInTheDocument();
    expect(
      screen.queryByText("Answer: Using only source-backed facts."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));

    expect(
      screen.getByText("Answer: Using only source-backed facts."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Grounding prevents invented details."),
    ).toBeInTheDocument();
  });

  it("limits voice clone transcript selection to three contiguous blocks", () => {
    const transcript: TranscriptSegment[] = [
      {
        id: "s1",
        startSeconds: 0,
        endSeconds: 5,
        text: "One",
        sourceKind: "local-stt",
      },
      {
        id: "s2",
        startSeconds: 5,
        endSeconds: 10,
        text: "Two",
        sourceKind: "local-stt",
      },
      {
        id: "s3",
        startSeconds: 10,
        endSeconds: 15,
        text: "Three",
        sourceKind: "local-stt",
      },
      {
        id: "s4",
        startSeconds: 15,
        endSeconds: 20,
        text: "Four",
        sourceKind: "local-stt",
      },
    ];

    expect(
      nextVoiceCloneTranscriptSegmentSelection(transcript, [], "s1"),
    ).toEqual(["s1"]);
    expect(
      nextVoiceCloneTranscriptSegmentSelection(transcript, ["s1"], "s2"),
    ).toEqual(["s1", "s2"]);
    expect(
      nextVoiceCloneTranscriptSegmentSelection(transcript, ["s1", "s2"], "s3"),
    ).toEqual(["s1", "s2", "s3"]);
    expect(
      nextVoiceCloneTranscriptSegmentSelection(
        transcript,
        ["s1", "s2", "s3"],
        "s4",
      ),
    ).toEqual(["s4"]);
    expect(
      nextVoiceCloneTranscriptSegmentSelection(transcript, ["s1"], "s3"),
    ).toEqual(["s3"]);
  });

  it("shows voice clone transcript controls only while clone mode is enabled", () => {
    const { rerender } = render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          isVoiceCloneModeEnabled: false,
        })}
      />,
    );

    expect(
      screen.queryByText("Voice clone reference blocks: 0/3"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", {
        name: /for voice cloning/i,
      }),
    ).not.toBeInTheDocument();

    rerender(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          isVoiceCloneModeEnabled: true,
        })}
      />,
    );

    expect(
      screen.getByText("Voice clone reference blocks: 0/3"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("checkbox", {
        name: /for voice cloning/i,
      }),
    ).toHaveLength(transcriptFixture.length);
  });

  it("uses selected transcript blocks as voice clone references", () => {
    const onUseVoiceCloneReferences = vi.fn();
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          isVoiceCloneModeEnabled: true,
          onUseVoiceCloneReferences,
        })}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("checkbox", {
        name: /for voice cloning/i,
      })[0],
    );
    fireEvent.click(screen.getByRole("button", { name: "Use as voice" }));

    expect(onUseVoiceCloneReferences).toHaveBeenCalledWith([
      transcriptFixture[0],
    ]);
  });

  it("renders a selection prompt without a video", () => {
    const onAddVideo = vi.fn();

    render(
      <WorkbenchView {...defaultProps({ onAddVideo })} video={undefined} />,
    );

    expect(screen.getByText(/select media from library/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^add media$/i }));

    expect(onAddVideo).toHaveBeenCalledTimes(1);
  });

  it("renders the three-column workbench when a video is selected", () => {
    render(<WorkbenchView {...defaultProps()} />);

    expect(screen.getByLabelText("Workbench sample")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /brief/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Summary" })[0],
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("renders an audio player in the first workbench column for audio assets", () => {
    const onPlayVideo = vi.fn();
    const onVideoTimeUpdate = vi.fn();
    const onOpenPictureInPicture = vi.fn();

    render(
      <WorkbenchView
        {...defaultProps({
          video: audioFixture,
          activeVideoId: audioFixture.id,
          openVideos: [audioFixture],
          onPlayVideo,
          onVideoTimeUpdate,
          onOpenPictureInPicture,
        })}
      />,
    );

    expect(screen.getAllByText("Audio sample")).not.toHaveLength(0);
    expect(
      screen.getByLabelText("Audio sample", { selector: "audio" }),
    ).toHaveAttribute("src", "audio/local-audio-sample/audio-sample.mp3");
    expect(
      screen.queryByRole("button", { name: /^audio$/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /play audio sample/i }));
    expect(onPlayVideo).toHaveBeenCalledWith("audio-1");
    expect(screen.queryByLabelText("Workbench sample")).not.toBeInTheDocument();

    const audio = screen.getByLabelText("Audio sample", { selector: "audio" });
    fireEvent.play(audio);
    expect(onPlayVideo).toHaveBeenCalledWith("audio-1");

    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      value: 12,
    });
    fireEvent.timeUpdate(audio);
    expect(onVideoTimeUpdate).toHaveBeenCalledWith("audio-1", 12);

    fireEvent.click(
      screen.getByRole("button", { name: /picture-in-picture/i }),
    );
    expect(onOpenPictureInPicture).toHaveBeenCalledWith("audio-1");
  });

  it("renders a PDF viewer in the first workbench column for PDF assets", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          video: pdfFixture,
          activeVideoId: pdfFixture.id,
          openVideos: [pdfFixture],
        })}
      />,
    );

    expect(screen.getByTitle("PDF sample")).toHaveAttribute(
      "src",
      "documents/local-pdf-sample/pdf-sample.pdf",
    );
    expect(screen.getByRole("heading", { name: /brief/i })).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("renders a CSV preview in the first workbench column for CSV assets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "segment,value\nNorth,42\nSouth,18\n",
      }),
    );

    render(
      <WorkbenchView
        {...defaultProps({
          video: csvFixture,
          activeVideoId: csvFixture.id,
          openVideos: [csvFixture],
        })}
      />,
    );

    expect(await screen.findByText("segment")).toBeInTheDocument();
    expect(screen.getByText("North")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("explains that transcription is required before summary generation", () => {
    render(<WorkbenchView {...defaultProps()} />);

    expect(screen.getByLabelText("Transcript example")).toHaveTextContent(
      "The host introduces the topic",
    );
    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Transcription is required for summary. Please extract transcription first.",
    );
    expect(screen.getByRole("button", { name: /summarize/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /save markdown/i }),
    ).not.toBeInTheDocument();
  });

  it("renders transcript segments and generated markdown", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summary: summaryFixture,
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: /jump to 0:12/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Transcript detail")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: /brief/i }),
    ).toBeInTheDocument();
  });

  it("shows transcript review, translation, overlay, and variant controls", async () => {
    const onReviewTranscript = vi.fn().mockResolvedValue(undefined);
    const onTranslateTranscript = vi.fn().mockResolvedValue(undefined);
    const onOpenTranscriptOverlay = vi.fn();
    const onSelectTranscriptVariant = vi.fn();

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          transcriptVariants: [translationFixture],
          onReviewTranscript,
          onTranslateTranscript,
          onOpenTranscriptOverlay,
          onSelectTranscriptVariant,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^review$/i }));
    expect(onReviewTranscript).toHaveBeenCalledWith("openai", "gpt-5.4-mini");

    fireEvent.click(screen.getByRole("button", { name: /^overlay$/i }));
    expect(onOpenTranscriptOverlay).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Transcript language" }),
      {
        key: "Enter",
        code: "Enter",
      },
    );
    fireEvent.click(await screen.findByRole("option", { name: "Korean" }));
    expect(onSelectTranscriptVariant).toHaveBeenCalledWith("translation-ko");

    fireEvent.click(screen.getByRole("button", { name: /^translate$/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Translate transcript",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Korean already exists",
    );
  });

  it("shows tooltips for transcript action buttons", async () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
        })}
      />,
    );

    fireEvent.focus(screen.getByRole("button", { name: /^review$/i }));
    expect(
      await screen.findAllByText("Proofread and improve the transcription"),
    ).not.toHaveLength(0);

    fireEvent.blur(screen.getByRole("button", { name: /^review$/i }));
    fireEvent.focus(screen.getByRole("button", { name: /^translate$/i }));
    expect(
      await screen.findAllByText("Translate the transcript to a new language"),
    ).not.toHaveLength(0);

    fireEvent.blur(screen.getByRole("button", { name: /^translate$/i }));
    fireEvent.focus(screen.getByRole("button", { name: /^overlay$/i }));
    expect(
      await screen.findAllByText(
        "Open the transcription in a separate overlay window",
      ),
    ).not.toHaveLength(0);

    expect(screen.getByRole("button", { name: /^review$/i })).toHaveTextContent(
      "Review",
    );
    expect(
      screen.getByRole("button", { name: /^translate$/i }),
    ).toHaveTextContent("Translate");
    expect(
      screen.getByRole("button", { name: /^overlay$/i }),
    ).toHaveTextContent("Overlay");
  });

  it("shows original and translated transcript text together", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          transcriptVariants: [translationFixture],
          activeTranscriptVariantId: "translation-ko",
        })}
      />,
    );

    const translatedText = screen.getByText("번역된 자막");
    const transcriptRow = translatedText.closest("li");

    expect(transcriptRow).toContainElement(
      screen.getByText("Transcript detail"),
    );
    expect(translatedText).toBeInTheDocument();
  });

  it("shows review and translation progress on transcript action buttons", async () => {
    let resolveReview: (() => void) | undefined;
    let resolveTranslation: (() => void) | undefined;
    const onReviewTranscript = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReview = resolve;
        }),
    );
    const onTranslateTranscript = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTranslation = resolve;
        }),
    );

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          onReviewTranscript,
          onTranslateTranscript,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^review$/i }));
    expect(
      screen.getByRole("button", { name: /^reviewing\.\.\.$/i }),
    ).toBeDisabled();
    resolveReview?.();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^review$/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /^translate$/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Translate transcript",
    );
    fireEvent.click(screen.getByRole("button", { name: /^translate$/i }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /^translating\.\.\.$/i }),
    ).toBeDisabled();
    expect(onTranslateTranscript).toHaveBeenCalledWith(
      "openai",
      "gpt-5.4-mini",
      expect.objectContaining({ code: "ko" }),
    );

    resolveTranslation?.();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^translate$/i }),
      ).toBeInTheDocument(),
    );
  });

  it("labels transcript source choices instead of showing a generic original transcript", async () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          transcriptVariants: [whisperSourceVariantFixture],
        })}
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Transcript language" }),
      {
        key: "Enter",
        code: "Enter",
      },
    );

    expect(
      await screen.findByRole("option", { name: "Provider captions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "AI transcription" }),
    ).toBeInTheDocument();
  });

  it("does not use source variant labels as summary target languages", async () => {
    const onGenerateSummary = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          transcriptVariants: [whisperSourceVariantFixture],
          activeTranscriptVariantId: "transcript-video-1-local-stt",
          onGenerateSummary,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^summarize$/i,
      }),
    );

    await waitFor(() =>
      expect(onGenerateSummary).toHaveBeenCalledWith(
        "openai",
        "gpt-5.4-mini",
        "youtube-blog",
        "default",
        undefined,
        false,
        whisperSourceVariantFixture.segments,
      ),
    );
  });

  it("shows markdown formatting controls when the summary is editable", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summary: summaryFixture,
          onUpdateSummaryMarkdown: vi.fn(),
        })}
      />,
    );

    expect(
      screen.getByLabelText("Markdown formatting toolbar"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Heading 1" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bullet list" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save markdown" }),
    ).toBeInTheDocument();
  });

  it("edits transcript segment text inline", () => {
    const onUpdateTranscriptSegment = vi.fn();
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          onUpdateTranscriptSegment,
        })}
      />,
    );

    fireEvent.focus(screen.getByRole("button", { name: /jump to 0:12/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /edit transcript at 0:12/i }),
    );
    fireEvent.change(screen.getByLabelText(/transcript text at 0:12/i), {
      target: { value: "Corrected transcript detail" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onUpdateTranscriptSegment).toHaveBeenCalledWith(
      "s1",
      "Corrected transcript detail",
    );
    expect(
      screen.queryByRole("button", { name: /edit transcript at 0:12/i }),
    ).not.toBeInTheDocument();
  });

  it("reveals transcript edit actions with row hover and focus styles", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          playbackState: {
            ...createInitialVideoPlaybackState(),
            activeVideoId: "video-1",
            status: "playing",
            currentTimeSeconds: 13,
          },
        })}
      />,
    );

    const jumpButton = screen.getByRole("button", { name: /jump to 0:12/i });
    const transcriptRow = jumpButton.closest("li");

    expect(
      screen.queryByRole("button", { name: /edit transcript at 0:12/i }),
    ).not.toBeInTheDocument();

    expect(transcriptRow).not.toBeNull();
    fireEvent.pointerEnter(transcriptRow as HTMLElement);
    expect(
      screen.getByRole("button", { name: /edit transcript at 0:12/i }),
    ).toBeInTheDocument();

    fireEvent.pointerLeave(transcriptRow as HTMLElement);
    expect(
      screen.queryByRole("button", { name: /edit transcript at 0:12/i }),
    ).not.toBeInTheDocument();

    fireEvent.focus(jumpButton);
    expect(
      screen.getByRole("button", { name: /edit transcript at 0:12/i }),
    ).toBeInTheDocument();

    play.mockRestore();
  });

  it("hides the transcript edit action when focus moves to another row", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: [
            {
              id: "s1",
              startSeconds: 12,
              endSeconds: 24,
              text: "Active transcript detail",
              sourceKind: "youtube-captions",
            },
            {
              id: "s2",
              startSeconds: 30,
              endSeconds: 42,
              text: "Next transcript detail",
              sourceKind: "youtube-captions",
            },
          ],
          playbackState: {
            ...createInitialVideoPlaybackState(),
            activeVideoId: "video-1",
            status: "playing",
            currentTimeSeconds: 13,
          },
        })}
      />,
    );

    const activeJumpButton = screen.getByRole("button", {
      name: /jump to 0:12/i,
    });
    const nextJumpButton = screen.getByRole("button", {
      name: /jump to 0:30/i,
    });

    fireEvent.focus(activeJumpButton);
    const activeEditButton = screen.getByRole("button", {
      name: /edit transcript at 0:12/i,
    });
    expect(activeEditButton).toBeInTheDocument();

    fireEvent.blur(activeJumpButton, { relatedTarget: nextJumpButton });
    fireEvent.focus(nextJumpButton);

    expect(
      screen.queryByRole("button", { name: /edit transcript at 0:12/i }),
    ).not.toBeInTheDocument();

    play.mockRestore();
  });

  it("hides the focused transcript edit action when clicking outside the transcript list", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          playbackState: {
            ...createInitialVideoPlaybackState(),
            activeVideoId: "video-1",
            status: "playing",
            currentTimeSeconds: 13,
          },
        })}
      />,
    );

    const jumpButton = screen.getByRole("button", { name: /jump to 0:12/i });

    fireEvent.focus(jumpButton);
    const editButton = screen.getByRole("button", {
      name: /edit transcript at 0:12/i,
    });
    expect(editButton).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(
      screen.queryByRole("button", { name: /edit transcript at 0:12/i }),
    ).not.toBeInTheDocument();

    play.mockRestore();
  });

  it("shows transcription progress while extraction is running", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcriptJob: transcriptJobFixture,
        })}
      />,
    );

    expect(
      screen.getByRole("progressbar", { name: /transcription progress/i }),
    ).toHaveAttribute("aria-valuenow", "64");
    expect(screen.getByText("Local STT")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /extracting transcript/i }),
    ).toBeDisabled();
  });

  it("shows local transcription preparation before stt progress starts", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcriptJob: {
            ...transcriptJobFixture,
            progressPercent: 1,
          },
        })}
      />,
    );

    expect(screen.getByText("Preparing transcription...")).toBeInTheDocument();
  });

  it("shows summary and chat generation state while provider calls are running", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summaryJob: summaryJobFixture,
          chatJob: chatJobFixture,
        })}
      />,
    );

    expect(screen.getAllByText("Generating summary...")).toHaveLength(1);
    expect(screen.getAllByText("AI is writing a response...")).toHaveLength(1);
    expect(screen.getAllByText("openai · gpt-5.4-mini")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
  });

  it("shortens model names in the summary generation status", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summaryJob: {
            ...summaryJobFixture,
            provider: "openrouter",
            model: "deepseek/deepseek-v4-flash",
          },
        })}
      />,
    );

    expect(
      screen.getByText("openrouter · deepseek-v4-flash"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("openrouter · deepseek/deepseek-v4-flash"),
    ).not.toBeInTheDocument();
  });

  it("renders streaming summary draft markdown while generation is running", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summaryJob: {
            ...summaryJobFixture,
            streamingMode: true,
            draftText: "# Draft summary\n\nStreaming paragraph",
          },
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Draft summary" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Streaming paragraph")).toBeInTheDocument();
  });

  it("renders streaming chat draft text while the response is running", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          chatJob: {
            ...chatJobFixture,
            streamingMode: true,
            draftText: "Streaming chat answer",
          },
        })}
      />,
    );

    expect(screen.getByText("Streaming chat answer")).toBeInTheDocument();
  });

  it("submits transcript extraction, summary generation, chat, and markdown save", async () => {
    const onExtractTranscript = vi.fn().mockResolvedValue(undefined);
    const onGenerateSummary = vi.fn().mockResolvedValue(undefined);
    const onSendChat = vi.fn().mockResolvedValue(undefined);
    const onSaveMarkdown = vi.fn();

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summary: summaryFixture,
          onExtractTranscript,
          onGenerateSummary,
          onSendChat,
          onSaveMarkdown,
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /extract transcript/i }),
    );
    await waitFor(() => expect(onExtractTranscript).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }));
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Summary language" }),
      {
        key: "Enter",
        code: "Enter",
      },
    );
    fireEvent.click(await screen.findByRole("option", { name: "Korean" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^summarize$/i,
      }),
    );
    await waitFor(() =>
      expect(onGenerateSummary).toHaveBeenCalledWith(
        "openai",
        "gpt-5.4-mini",
        "youtube-blog",
        "default",
        "Korean",
        false,
        transcriptFixture,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /save markdown/i }));
    expect(onSaveMarkdown).toHaveBeenCalledWith("summary-video-1");

    fireEvent.change(screen.getByLabelText(/chat question/i), {
      target: { value: "What mattered?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() =>
      expect(onSendChat).toHaveBeenCalledWith({
        question: "What mattered?",
        contextMode: "summary",
        provider: "openai",
        model: "gpt-5.4-mini",
        summaryId: "summary-video-1",
        streamingMode: false,
      }),
    );
  });

  it("shows the submitted user chat while waiting for the assistant", async () => {
    let resolveSend: () => void = () => {};
    const onSendChat = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );

    render(
      <WorkbenchView
        {...defaultProps({
          summary: summaryFixture,
          onSendChat,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText(/chat question/i), {
      target: { value: "What mattered?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByText("What mattered?")).toBeInTheDocument();
    expect(screen.getByText("AI is writing a response...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
    expect(screen.getByLabelText(/chat question/i)).toHaveValue("");
    await waitFor(() =>
      expect(onSendChat).toHaveBeenCalledWith({
        question: "What mattered?",
        contextMode: "summary",
        provider: "openai",
        model: "gpt-5.4-mini",
        summaryId: "summary-video-1",
        streamingMode: false,
      }),
    );

    await act(async () => {
      resolveSend();
    });
    await waitFor(() =>
      expect(
        screen.queryByText("AI is writing a response..."),
      ).not.toBeInTheDocument(),
    );
  });

  it("starts transcription from the summary-required warning", async () => {
    const onExtractTranscript = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: [],
          onExtractTranscript,
        })}
      />,
    );

    expect(
      screen.getByText(/transcription is required for summary/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^transcribe$/i }));

    await waitFor(() => expect(onExtractTranscript).toHaveBeenCalled());
  });

  it("uses separate synced provider preferences for summary and chat", async () => {
    const onGenerateSummary = vi.fn().mockResolvedValue(undefined);
    const onSendChat = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summary: summaryFixture,
          summaryProvider: "anthropic",
          summaryProviderModel: "claude-sonnet-4-6",
          summaryStreamingMode: true,
          chatProvider: "gemini",
          chatProviderModel: "gemini-3.5-flash",
          chatStreamingMode: false,
          onSummaryProviderPreferenceChange: vi.fn(),
          onChatProviderPreferenceChange: vi.fn(),
          onGenerateSummary,
          onSendChat,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^summarize$/i,
      }),
    );
    await waitFor(() =>
      expect(onGenerateSummary).toHaveBeenCalledWith(
        "anthropic",
        "claude-sonnet-4-6",
        "youtube-blog",
        "default",
        undefined,
        true,
        transcriptFixture,
      ),
    );

    fireEvent.change(screen.getByLabelText(/chat question/i), {
      target: { value: "What mattered?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() =>
      expect(onSendChat).toHaveBeenCalledWith({
        question: "What mattered?",
        contextMode: "summary",
        provider: "gemini",
        model: "gemini-3.5-flash",
        summaryId: "summary-video-1",
        streamingMode: false,
      }),
    );
  });

  it("toggles summary streaming mode from the controls dialog", async () => {
    const onGenerateSummary = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          onGenerateSummary,
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /summary provider \/ provider model/i,
      }),
    );
    fireEvent.click(screen.getByRole("switch", { name: /streaming mode/i }));
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^summarize$/i,
      }),
    );

    await waitFor(() =>
      expect(onGenerateSummary).toHaveBeenCalledWith(
        "openai",
        "gpt-5.4-mini",
        "youtube-blog",
        "default",
        undefined,
        true,
        transcriptFixture,
      ),
    );
  });

  it("shows the shortened model name in the summary provider trigger", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summaryProvider: "openrouter",
          summaryProviderModel: "openrouter:deepseek/deepseek-v4-flash",
        })}
      />,
    );

    const providerButton = screen.getByRole("button", {
      name: /summary provider \/ provider model/i,
    });

    expect(providerButton).toHaveTextContent("OpenRouter");
    expect(providerButton).toHaveTextContent("deepseek-v4-flash");
    expect(providerButton).not.toHaveTextContent("openrouter:deepseek");
  });

  it("summarizes the active translated transcript in the target language", async () => {
    const onGenerateSummary = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          transcriptVariants: [translationFixture],
          activeTranscriptVariantId: "translation-ko",
          onGenerateSummary,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^summarize$/i,
      }),
    );

    await waitFor(() =>
      expect(onGenerateSummary).toHaveBeenCalledWith(
        "openai",
        "gpt-5.4-mini",
        "youtube-blog",
        "default",
        "Korean",
        false,
        translationFixture.segments,
      ),
    );
  });

  it("toggles chat streaming mode from the controls dialog", async () => {
    const onSendChat = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          summary: summaryFixture,
          onSendChat,
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /chat provider \/ provider model/i,
      }),
    );
    fireEvent.click(screen.getByRole("switch", { name: /streaming mode/i }));
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    fireEvent.change(screen.getByLabelText(/chat question/i), {
      target: { value: "What mattered?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(onSendChat).toHaveBeenCalledWith({
        question: "What mattered?",
        contextMode: "summary",
        provider: "openai",
        model: "gpt-5.4-mini",
        summaryId: "summary-video-1",
        streamingMode: true,
      }),
    );
  });

  it("renders the selected provider once in the summary controls dialog", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /summary provider \/ provider model/i,
      }),
    );

    const providerTrigger = screen.getByRole("combobox", {
      name: /summary provider/i,
    });

    expect(providerTrigger).toHaveTextContent("OpenAI");
    expect(providerTrigger.querySelectorAll("svg")).toHaveLength(2);
    expect(providerTrigger.firstElementChild?.tagName).toBe("DIV");
  });

  it("switches between open video and summary tabs", () => {
    const onSelectVideoTab = vi.fn();
    const onCloseVideoTab = vi.fn();
    const onSelectSummaryTab = vi.fn();

    render(
      <WorkbenchView
        {...defaultProps({
          openVideos: [videoFixture, secondVideoFixture],
          activeVideoId: "video-1",
          summary: summaryFixture,
          summaries: [summaryFixture, secondSummaryFixture],
          activeSummaryId: "summary-video-1-alt",
          onSelectVideoTab,
          onCloseVideoTab,
          onSelectSummaryTab,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Second video" }));
    expect(onSelectVideoTab).toHaveBeenCalledWith("video-2");

    fireEvent.click(
      screen.getByRole("button", { name: /close second video/i }),
    );
    expect(onCloseVideoTab).toHaveBeenCalledWith("video-2");

    expect(
      screen.getByRole("heading", { name: "Alternate" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /summary 1/i }));
    expect(onSelectSummaryTab).toHaveBeenCalledWith("summary-video-1");
  });

  it("replaces summary editor content when the active summary tab changes", async () => {
    const { rerender } = render(
      <WorkbenchView
        {...defaultProps({
          summary: secondSummaryFixture,
          summaries: [secondSummaryFixture, summaryFixture],
          activeSummaryId: "summary-video-1-alt",
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Alternate" }),
    ).toBeInTheDocument();

    rerender(
      <WorkbenchView
        {...defaultProps({
          summary: summaryFixture,
          summaries: [secondSummaryFixture, summaryFixture],
          activeSummaryId: "summary-video-1",
        })}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Summary" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Alternate" }),
    ).not.toBeInTheDocument();
  });

  it("requests the shared add video dialog from the media tabs", () => {
    const onAddVideo = vi.fn();

    render(
      <WorkbenchView
        {...defaultProps({
          openVideos: [videoFixture, secondVideoFixture],
          onAddVideo,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add media/i }));

    expect(onAddVideo).toHaveBeenCalledTimes(1);
  });

  it("cycles open video tabs with bracket shortcuts", () => {
    const onSelectVideoTab = vi.fn();
    const props = defaultProps({
      openVideos: [videoFixture, secondVideoFixture],
      activeVideoId: "video-1",
      onSelectVideoTab,
    });
    const { rerender } = render(<WorkbenchView {...props} />);

    fireEvent.keyDown(window, {
      key: "]",
      code: "BracketRight",
      metaKey: true,
      shiftKey: true,
    });
    expect(onSelectVideoTab).toHaveBeenCalledWith("video-2");

    rerender(<WorkbenchView {...props} activeVideoId="video-2" />);
    fireEvent.keyDown(window, {
      key: "[",
      code: "BracketLeft",
      metaKey: true,
      shiftKey: true,
    });
    expect(onSelectVideoTab).toHaveBeenLastCalledWith("video-1");
  });

  it("seeks playback from transcript timestamps", () => {
    const onVideoTimeUpdate = vi.fn();
    const onPlayVideo = vi.fn();

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          onVideoTimeUpdate,
          onPlayVideo,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /jump to 0:12/i }));

    expect(onVideoTimeUpdate).toHaveBeenCalledWith("video-1", 12);
    expect(onPlayVideo).toHaveBeenCalledWith("video-1");
  });

  it("seeks playback from transcript text", () => {
    const onVideoTimeUpdate = vi.fn();
    const onPlayVideo = vi.fn();

    render(
      <WorkbenchView
        {...defaultProps({
          transcript: transcriptFixture,
          onVideoTimeUpdate,
          onPlayVideo,
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /play transcript from 0:12/i }),
    );

    expect(onVideoTimeUpdate).toHaveBeenCalledWith("video-1", 12);
    expect(onPlayVideo).toHaveBeenCalledWith("video-1");
  });

  it("seeks summary timestamp links without starting playback", async () => {
    const onVideoTimeUpdate = vi.fn();
    const onPlayVideo = vi.fn();
    const onSeekVideo = vi.fn();

    render(
      <WorkbenchView
        {...defaultProps({
          summary: {
            ...summaryFixture,
            markdown:
              "# Summary\n\n### 미국 시스템의 독특함과 대체 불가능성 - 0:30",
          },
          onVideoTimeUpdate,
          onPlayVideo,
          onSeekVideo,
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Seek to 0:30" }),
    );

    expect(onSeekVideo).toHaveBeenCalledWith("video-1", 30);
    expect(onPlayVideo).not.toHaveBeenCalled();
    expect(onVideoTimeUpdate).not.toHaveBeenCalled();
  });

  it("requests summary timestamp frame previews on hover", async () => {
    const onTimestampFramePreview = vi.fn(async () => ({
      relativePath: "videos/video-1/frames/30.jpg",
      imageUrl: "asset://localhost/frame-30.jpg",
      cached: true,
    }));

    render(
      <WorkbenchView
        {...defaultProps({
          summary: {
            ...summaryFixture,
            markdown:
              "# Summary\n\n### 미국 시스템의 독특함과 대체 불가능성 - 0:30",
          },
          onTimestampFramePreview,
        })}
      />,
    );

    fireEvent.mouseEnter(
      await screen.findByRole("button", { name: "Seek to 0:30" }),
    );

    await screen.findByRole("img", { name: "Frame preview for 0:30" });
    expect(onTimestampFramePreview).toHaveBeenCalledWith(videoFixture, 30);
  });

  it("highlights the transcript segment that matches active playback time", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          transcript: [
            {
              id: "s1",
              startSeconds: 0,
              endSeconds: 12,
              text: "Opening transcript",
              sourceKind: "youtube-captions",
            },
            {
              id: "s2",
              startSeconds: 12,
              endSeconds: 24,
              text: "Active transcript detail",
              sourceKind: "youtube-captions",
            },
          ],
          playbackState: {
            ...createInitialVideoPlaybackState(),
            activeVideoId: "video-1",
            status: "playing",
            currentTimeSeconds: 13,
          },
          isInlinePlayerSuppressed: true,
        })}
      />,
    );

    expect(
      screen.getByText("Active transcript detail").closest("li"),
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByText("Opening transcript").closest("li"),
    ).not.toHaveAttribute("aria-current");
  });

  it("highlights transcript timing while audio playback is running", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(
      <WorkbenchView
        {...defaultProps({
          video: audioFixture,
          activeVideoId: audioFixture.id,
          openVideos: [audioFixture],
          transcript: [
            {
              id: "s1",
              startSeconds: 0,
              endSeconds: 12,
              text: "Opening audio transcript",
              sourceKind: "local-stt",
            },
            {
              id: "s2",
              startSeconds: 12,
              endSeconds: 24,
              text: "Active audio transcript",
              sourceKind: "local-stt",
            },
          ],
          playbackState: {
            ...createInitialVideoPlaybackState(),
            activeVideoId: "audio-1",
            status: "playing",
            currentTimeSeconds: 13,
          },
        })}
      />,
    );

    expect(
      screen.getByText("Active audio transcript").closest("li"),
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByText("Opening audio transcript").closest("li"),
    ).not.toHaveAttribute("aria-current");
  });

  it("opens the selected video in picture-in-picture", () => {
    const onOpenPictureInPicture = vi.fn();

    render(
      <WorkbenchView
        {...defaultProps({
          onOpenPictureInPicture,
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /picture-in-picture/i }),
    );

    expect(onOpenPictureInPicture).toHaveBeenCalledWith("video-1");
  });

  it("shows tooltips for video controls and the add tab button", async () => {
    render(<WorkbenchView {...defaultProps()} />);

    fireEvent.focus(
      screen.getByRole("button", { name: /picture-in-picture/i }),
    );
    expect(
      await screen.findAllByText("Picture-in-picture player"),
    ).not.toHaveLength(0);

    fireEvent.focus(screen.getByRole("button", { name: /enter fullscreen/i }));
    expect(await screen.findAllByText("Enter fullscreen")).not.toHaveLength(0);

    fireEvent.focus(screen.getByRole("button", { name: /add media/i }));
    expect(await screen.findAllByText("Add media")).not.toHaveLength(0);
  });

  it("renders chat messages with context mode", () => {
    const onResetChat = vi.fn();
    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: [
            {
              ...chatFixture[0],
              content: "**Answer** from transcript\n\n- Key point",
            },
          ],
          onResetChat,
        })}
      />,
    );

    expect(screen.getByText("Answer").closest("strong")).not.toBeNull();
    expect(screen.getByText("Key point")).toBeInTheDocument();
    expect(
      screen.queryByText("**Answer** from transcript"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New chat" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New chat" })).toHaveClass("h-8");
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(onResetChat).toHaveBeenCalledTimes(1);
  });

  it("passes rendered chat text to read message", () => {
    const onReadChatMessage = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: [
            {
              ...chatFixture[0],
              content: "**Answer** from transcript\n\n- Key point",
            },
          ],
          onReadChatMessage,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Read message" }));

    expect(onReadChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-1" }),
      "Answer from transcript Key point",
    );
  });

  it("hides the read message action on user chat bubbles", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: [
            {
              ...chatFixture[0],
              id: "chat-user-1",
              role: "user",
              content: "Can you summarize this?",
              tokenUsage: undefined,
            },
          ],
          onReadChatMessage: vi.fn().mockResolvedValue(undefined),
        })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Read message" }),
    ).not.toBeInTheDocument();
  });

  it("shows a global chat speech generation as the active read state", () => {
    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: chatFixture,
          generatingChatTtsMessageId: "chat-1",
          onReadChatMessage: vi.fn().mockResolvedValue(undefined),
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Read message" })).toBeDisabled();
  });

  it("keeps other chat bubbles clickable while a different message is generating", () => {
    const latestMessage = {
      ...chatFixture[0],
      id: "chat-2",
      content: "Second answer",
      tokenUsage: undefined,
    };

    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: [chatFixture[0], latestMessage],
          generatingChatTtsMessageId: "chat-1",
          onReadChatMessage: vi.fn().mockResolvedValue(undefined),
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Read message" }),
    ).not.toBeDisabled();
  });

  it("shows a download action when generated chat speech exists", () => {
    const onDownloadChatTtsAudio = vi.fn();
    const audio = {
      audioPath: "videos/video-1/chat/tts/chat-1/tts-1/audio.wav",
      generationId: "tts-1",
      sizeBytes: 12,
    };

    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: chatFixture,
          chatTtsAudioByMessageId: { "chat-1": audio },
          onDownloadChatTtsAudio,
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Download voice message" }),
    );

    expect(onDownloadChatTtsAudio).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-1" }),
      audio,
    );
  });

  it("shows play, regenerate, and download actions when generated chat speech exists", () => {
    const onPlayChatTtsAudio = vi.fn();
    const onReadChatMessage = vi.fn().mockResolvedValue(undefined);
    const onDownloadChatTtsAudio = vi.fn();
    const audio = {
      audioPath: "videos/video-1/chat/tts/chat-1/tts-1/audio.wav",
      generationId: "tts-1",
      sizeBytes: 12,
    };

    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: chatFixture,
          chatTtsAudioByMessageId: { "chat-1": audio },
          onPlayChatTtsAudio,
          onReadChatMessage,
          onDownloadChatTtsAudio,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play voice message" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Regenerate voice message" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Download voice message" }),
    );

    expect(onPlayChatTtsAudio).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-1" }),
      audio,
    );
    expect(onReadChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-1" }),
      "Answer from transcript",
    );
    expect(onDownloadChatTtsAudio).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-1" }),
      audio,
    );
  });

  it("matches generated speech paths that use the Rust chat message sanitizer", () => {
    const onPlayChatTtsAudio = vi.fn();
    const message = {
      ...chatFixture[0],
      id: "chat-video-1-assistant-2026-05-23T00:00:00.000Z",
    };
    const audio = {
      audioPath:
        "videos/video-1/chat/tts/chat-video-1-assistant-2026-05-23t00-00-00-000z/voice-message-123/voice-message-123.wav",
      generationId: "voice-message-123",
      sizeBytes: 12,
    };

    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: [message],
          chatTtsAudioByMessageId: { [message.id]: audio },
          onPlayChatTtsAudio,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play voice message" }));

    expect(onPlayChatTtsAudio).toHaveBeenCalledWith(
      expect.objectContaining({ id: message.id }),
      audio,
    );
  });

  it("only shows generated speech controls for the owning chat bubble", () => {
    const onPlayChatTtsAudio = vi.fn();
    const onReadChatMessage = vi.fn().mockResolvedValue(undefined);
    const onDownloadChatTtsAudio = vi.fn();
    const audio = {
      audioPath:
        "videos/video-1/chat/tts/chat-1/voice-message-123/voice-message-123.wav",
      generationId: "voice-message-123",
      sizeBytes: 12,
    };
    const secondMessage = {
      ...chatFixture[0],
      id: "chat-2",
      content: "Second answer",
      tokenUsage: undefined,
    };

    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: [chatFixture[0], secondMessage],
          chatTtsAudioByMessageId: {
            "chat-1": audio,
            "chat-2": audio,
          },
          onPlayChatTtsAudio,
          onReadChatMessage,
          onDownloadChatTtsAudio,
        })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Play voice message" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download voice message" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Read message" }),
    ).toBeInTheDocument();

    const olderBubble = screen
      .getByText("Answer from transcript")
      .closest("li");
    expect(olderBubble).not.toBeNull();
    fireEvent.pointerEnter(olderBubble as HTMLElement);

    expect(
      screen.getByRole("button", { name: "Play voice message" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download voice message" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Regenerate voice message" }),
    ).toBeInTheDocument();
  });

  it("shows pause action for the currently playing chat speech", () => {
    const onPlayChatTtsAudio = vi.fn();
    const onPauseChatTtsAudio = vi.fn();
    const audio = {
      audioPath:
        "videos/video-1/chat/tts/chat-1/voice-message-123/voice-message-123.wav",
      generationId: "voice-message-123",
      sizeBytes: 12,
    };

    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: chatFixture,
          chatTtsAudioByMessageId: { "chat-1": audio },
          playingChatTtsMessageId: "chat-1",
          onPlayChatTtsAudio,
          onPauseChatTtsAudio,
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Pause voice message" }),
    );

    expect(onPauseChatTtsAudio).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-1" }),
      audio,
    );
    expect(onPlayChatTtsAudio).not.toHaveBeenCalled();
  });

  it("reveals older chat bubble actions only on hover or focus", () => {
    const olderMessage = {
      ...chatFixture[0],
      id: "chat-old",
      content: "Older answer",
    };
    const latestMessage = {
      ...chatFixture[0],
      id: "chat-latest",
      content: "Latest answer",
      tokenUsage: undefined,
    };

    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: [olderMessage, latestMessage],
        })}
      />,
    );

    const olderBubble = screen.getByText("Older answer").closest("li");
    expect(olderBubble).not.toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Copy message" }),
    ).toHaveLength(1);

    fireEvent.pointerEnter(olderBubble as HTMLElement);
    expect(
      screen.getAllByRole("button", { name: "Copy message" }),
    ).toHaveLength(2);

    fireEvent.pointerLeave(olderBubble as HTMLElement);
    expect(
      screen.getAllByRole("button", { name: "Copy message" }),
    ).toHaveLength(1);

    fireEvent.focus(olderBubble as HTMLElement);
    expect(
      screen.getAllByRole("button", { name: "Copy message" }),
    ).toHaveLength(2);

    fireEvent.blur(olderBubble as HTMLElement, {
      relatedTarget: document.body,
    });
    expect(
      screen.getAllByRole("button", { name: "Copy message" }),
    ).toHaveLength(1);
  });

  it("shows chat bubble copy actions, token usage, and provider controls", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <WorkbenchView
        {...defaultProps({
          chatMessages: chatFixture,
        })}
      />,
    );

    const copyButton = screen.getByRole("button", { name: "Copy message" });
    fireEvent.click(copyButton);
    expect(writeText).toHaveBeenCalledWith("Answer from transcript");
    await waitFor(() =>
      expect(copyButton).toHaveAttribute("data-copied", "true"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Token usage" }));
    expect(await screen.findByText("Cached")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    const providerButton = screen.getByRole("button", {
      name: /chat provider \/ provider model/i,
    });
    expect(providerButton).toHaveClass("w-fit");
    expect(providerButton).toHaveTextContent("gpt-5.4-mini");

    fireEvent.click(
      screen.getByRole("button", {
        name: /chat provider \/ provider model/i,
      }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("OpenAI");
  });

  it("shortens provider model names by separators", () => {
    expect(shortProviderModelName("deepseek/deepseek-v4-flash")).toBe(
      "deepseek-v4-flash",
    );
    expect(shortProviderModelName("openai:gpt-5.4-mini")).toBe("gpt-5.4-mini");
  });
});

const videoFixture: VideoAsset = {
  id: "video-1",
  title: "Workbench sample",
  sourceKind: "youtube",
  originalUri: "https://youtu.be/example",
  libraryPath: "videos/video-1/source.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const secondVideoFixture: VideoAsset = {
  ...videoFixture,
  id: "video-2",
  title: "Second video",
  libraryPath: "videos/video-2/source.mp4",
};

const audioFixture: VideoAsset = {
  id: "audio-1",
  title: "Audio sample",
  sourceType: "audio",
  sourceKind: "local-file",
  originalUri: "/tmp/audio-sample.mp3",
  libraryPath: "audio/local-audio-sample/audio-sample.mp3",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const pdfFixture: VideoAsset = {
  id: "pdf-1",
  title: "PDF sample",
  sourceType: "pdf",
  sourceKind: "local-file",
  originalUri: "/tmp/pdf-sample.pdf",
  libraryPath: "documents/local-pdf-sample/pdf-sample.pdf",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const csvFixture: VideoAsset = {
  id: "csv-1",
  title: "CSV sample",
  sourceType: "csv",
  sourceKind: "local-file",
  originalUri: "/tmp/metrics.csv",
  libraryPath: "csvs/csv-1/metrics.csv",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const transcriptFixture: TranscriptSegment[] = [
  {
    id: "s1",
    startSeconds: 12,
    endSeconds: 24,
    text: "Transcript detail",
    sourceKind: "youtube-captions",
  },
];

const translationFixture = {
  id: "translation-ko",
  videoId: "video-1",
  kind: "translation" as const,
  languageCode: "ko",
  languageLabel: "Korean",
  provider: "openai" as const,
  model: "gpt-5.4-mini",
  segments: [
    {
      ...transcriptFixture[0],
      text: "번역된 자막",
    },
  ],
  artifactPath: "videos/video-1/transcript/translation-ko/transcript.txt",
  createdAtIso: "2026-05-21T00:02:00.000Z",
};

const whisperSourceVariantFixture = {
  id: "transcript-video-1-local-stt",
  videoId: "video-1",
  kind: "source" as const,
  sourceKind: "local-stt" as const,
  languageLabel: "AI transcription",
  segments: [
    {
      id: "local-stt-1",
      startSeconds: 12,
      endSeconds: 24,
      text: "Whisper transcript",
      sourceKind: "local-stt" as const,
    },
  ],
  artifactPath:
    "videos/video-1/transcript/transcript-video-1-local-stt/transcript.txt",
  createdAtIso: "2026-05-21T00:03:00.000Z",
};

const transcriptJobFixture: TranscriptJob = {
  id: "transcript-video-1-pipeline",
  videoId: "video-1",
  status: "running",
  preferredSource: "local-stt",
  progressPercent: 64,
};

const summaryFixture: SummaryDocument = {
  id: "summary-video-1",
  videoId: "video-1",
  markdown: "# Summary",
  provider: "openai",
  sourceSegmentCount: 1,
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const secondSummaryFixture: SummaryDocument = {
  ...summaryFixture,
  id: "summary-video-1-alt",
  markdown: "# Alternate",
  provider: "anthropic",
  createdAtIso: "2026-05-21T00:01:00.000Z",
};

const podcastFixture: PodcastDocument = {
  schemaVersion: 1,
  id: "podcast-video-1",
  sourceAssetId: "video-1",
  mode: "podcast-summary",
  sourceKind: "current-summary",
  lengthMode: "default",
  provider: "openai",
  model: "gpt-5.4-mini",
  createdAtIso: "2026-05-21T00:02:00.000Z",
  script: {
    title: "Workbench podcast",
    turns: [
      {
        id: "turn-0001",
        speakerId: "A",
        speakerLabel: "Host",
        text: "Welcome to the brief.",
      },
      {
        id: "turn-0002",
        speakerId: "B",
        speakerLabel: "Guest",
        text: "Here is the key point.",
      },
    ],
    markdown:
      "# Workbench podcast\n\n**Host**\n\nWelcome to the brief.\n\n**Guest**\n\nHere is the key point.\n",
  },
  tts: {
    modelId: "Supertone/supertonic-3",
    languageCode: "en",
    speakers: [
      { id: "A", label: "Host", voiceStyleId: "M1" },
      { id: "B", label: "Guest", voiceStyleId: "F2" },
    ],
  },
  artifacts: {
    rootDirectory: "videos/video-1/podcast/podcast-video-1",
    manifestPath: "videos/video-1/podcast/podcast-video-1/podcast.json",
    scriptPath: "videos/video-1/podcast/podcast-video-1/script.md",
    turnAudioDirectory: "videos/video-1/podcast/podcast-video-1/audio/turns",
    podcastAudioPath:
      "videos/video-1/podcast/podcast-video-1/audio/podcast.wav",
    turnAudioPaths: [
      "videos/video-1/podcast/podcast-video-1/audio/turns/0001-speaker-a.wav",
      "videos/video-1/podcast/podcast-video-1/audio/turns/0002-speaker-b.wav",
    ],
  },
  turnTimings: [
    {
      turnId: "turn-0001",
      audioPath:
        "videos/video-1/podcast/podcast-video-1/audio/turns/0001-speaker-a.wav",
      startSeconds: 0,
      endSeconds: 11.5,
      durationSeconds: 11.5,
    },
    {
      turnId: "turn-0002",
      audioPath:
        "videos/video-1/podcast/podcast-video-1/audio/turns/0002-speaker-b.wav",
      startSeconds: 12,
      endSeconds: 24,
      durationSeconds: 12,
    },
  ],
  durationSeconds: 24,
  sizeBytes: 1024,
};

const quizFixture: QuizDocument = {
  schemaVersion: 1,
  id: "quiz-video-1",
  sourceAssetId: "video-1",
  mode: "multiple-choice",
  questionCount: 1,
  areaOfInterest: "key points",
  provider: "openai",
  model: "gpt-5.4-mini",
  createdAtIso: "2026-05-21T00:03:00.000Z",
  title: "Workbench quiz",
  description: "A focused quiz.",
  items: [
    {
      id: "question-0001",
      type: "multiple-choice",
      question: "What is the key point?",
      options: ["The summary is grounded", "The source is ignored"],
      correctOptionIndex: 0,
      explanation: "The quiz is based on the current media.",
    },
  ],
  artifactPath: "videos/video-1/quiz/quiz-video-1/quiz.json",
};

const flashCardQuizFixture: QuizDocument = {
  schemaVersion: 1,
  id: "quiz-video-1-flash-card",
  sourceAssetId: "video-1",
  mode: "flash-card",
  questionCount: 1,
  areaOfInterest: "key points",
  provider: "openai",
  model: "gpt-5.4-mini",
  createdAtIso: "2026-05-21T00:04:00.000Z",
  title: "Workbench flash cards",
  description: "A focused flash card set.",
  items: [
    {
      id: "question-0001",
      type: "flash-card",
      front: "Define grounding.",
      back: "Using only source-backed facts.",
      explanation: "Grounding prevents invented details.",
    },
  ],
  artifactPath: "videos/video-1/quiz/quiz-video-1-flash-card/quiz.json",
};

const summaryJobFixture: AiGenerationJob = {
  videoId: "video-1",
  status: "running",
  provider: "openai",
  model: "gpt-5.4-mini",
};

const chatJobFixture: AiGenerationJob = {
  videoId: "video-1",
  status: "running",
  provider: "openai",
  model: "gpt-5.4-mini",
};

const chatFixture: ChatMessage[] = [
  {
    id: "chat-1",
    videoId: "video-1",
    role: "assistant",
    content: "Answer from transcript",
    contextMode: "transcript",
    provider: "openai",
    model: "gpt-5.4-mini",
    tokenUsage: {
      inputTokens: 100,
      cachedInputTokens: 42,
      outputTokens: 12,
      totalTokens: 112,
    },
    createdAtIso: "2026-05-21T00:00:00.000Z",
  },
];

function defaultProps(
  overrides: Partial<ComponentProps<typeof WorkbenchView>> = {},
) {
  return {
    video: videoFixture,
    transcript: [],
    chatMessages: [],
    onAddVideo: vi.fn(),
    onExtractTranscript: vi.fn().mockResolvedValue(undefined),
    onReviewTranscript: vi.fn().mockResolvedValue(undefined),
    onTranslateTranscript: vi.fn().mockResolvedValue(undefined),
    onGenerateSummary: vi.fn().mockResolvedValue(undefined),
    onSendChat: vi.fn().mockResolvedValue(undefined),
    onResetChat: vi.fn(),
    onSaveMarkdown: vi.fn(),
    onUpdateTranscriptSegment: vi.fn(),
    playbackState: createInitialVideoPlaybackState(),
    onPlayVideo: vi.fn(),
    onPauseVideo: vi.fn(),
    onVideoTimeUpdate: vi.fn(),
    onSeekVideo: vi.fn(),
    onVideoEnded: vi.fn(),
    onOpenPictureInPicture: vi.fn(),
    ...overrides,
  };
}
