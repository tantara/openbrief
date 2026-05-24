import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  SummaryDocument,
  TranscriptJob,
  TranscriptSegment,
  VideoAsset,
} from "@/domain/media-library";
import {
  nextVoiceCloneTranscriptSegmentSelection,
  shortProviderModelName,
  WorkbenchView,
} from "@/features/workbench/WorkbenchView";
import type { AiGenerationJob } from "@/hooks/useMediaLibrary";
import { createInitialVideoPlaybackState } from "@/hooks/useVideoPlayback";

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

  it("limits voice clone transcript selection to three contiguous blocks", () => {
    const transcript: TranscriptSegment[] = [
      { id: "s1", startSeconds: 0, endSeconds: 5, text: "One", sourceKind: "local-stt" },
      { id: "s2", startSeconds: 5, endSeconds: 10, text: "Two", sourceKind: "local-stt" },
      { id: "s3", startSeconds: 10, endSeconds: 15, text: "Three", sourceKind: "local-stt" },
      { id: "s4", startSeconds: 15, endSeconds: 20, text: "Four", sourceKind: "local-stt" },
    ];

    expect(nextVoiceCloneTranscriptSegmentSelection(transcript, [], "s1")).toEqual([
      "s1",
    ]);
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

  it("renders a selection prompt without a video", () => {
    const onAddVideo = vi.fn();

    render(
      <WorkbenchView
        {...defaultProps({ onAddVideo })}
        video={undefined}
      />,
    );

    expect(screen.getByText(/select media from library/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^add media$/i }));

    expect(onAddVideo).toHaveBeenCalledTimes(1);
  });

  it("renders the three-column workbench when a video is selected", () => {
    render(<WorkbenchView {...defaultProps()} />);

    expect(screen.getByLabelText("Workbench sample")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Summary" }))
      .toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summary" }))
      .toHaveAttribute("aria-pressed", "true");
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
    expect(screen.getByLabelText("Audio sample", { selector: "audio" }))
      .toHaveAttribute("src", "audio/local-audio-sample/audio-sample.mp3");
    expect(screen.queryByRole("button", { name: /^audio$/i }))
      .not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /picture-in-picture/i }));
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
    expect(screen.getByRole("heading", { name: "Summary" }))
      .toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /save markdown/i }))
      .not.toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: /jump to 0:12/i })).toBeInTheDocument();
    expect(screen.getByText("Transcript detail")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Summary" }))
      .toBeInTheDocument();
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

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Transcript language" }), {
      key: "Enter",
      code: "Enter",
    });
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

    expect(transcriptRow).toContainElement(screen.getByText("Transcript detail"));
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
      expect(screen.getByRole("button", { name: /^review$/i }))
        .toBeInTheDocument(),
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
      expect(screen.getByRole("button", { name: /^translate$/i }))
        .toBeInTheDocument(),
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

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Transcript language" }), {
      key: "Enter",
      code: "Enter",
    });

    expect(await screen.findByRole("option", { name: "Provider captions" }))
      .toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Whisper transcription" }))
      .toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Heading 1" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bullet list" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save markdown" }))
      .toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /edit transcript at 0:12/i }));
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

    const activeJumpButton = screen.getByRole("button", { name: /jump to 0:12/i });
    const nextJumpButton = screen.getByRole("button", { name: /jump to 0:30/i });

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

    expect(screen.getByRole("progressbar", { name: /transcription progress/i }))
      .toHaveAttribute("aria-valuenow", "64");
    expect(screen.getByText("Local STT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /extracting transcript/i }))
      .toBeDisabled();
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

    expect(screen.getAllByText("Generating summary...")).toHaveLength(2);
    expect(screen.getAllByText("AI is writing a response...")).toHaveLength(2);
    expect(screen.getAllByText("openai · gpt-5.4-mini")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /generating summary/i }))
      .toBeDisabled();
    expect(screen.getByRole("button", { name: /ai is writing a response/i }))
      .toBeDisabled();
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

    expect(screen.getByText("openrouter · deepseek-v4-flash"))
      .toBeInTheDocument();
    expect(screen.queryByText("openrouter · deepseek/deepseek-v4-flash"))
      .not.toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: "Draft summary" }))
      .toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /extract transcript/i }));
    await waitFor(() => expect(onExtractTranscript).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Summary language" }), {
      key: "Enter",
      code: "Enter",
    });
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

    fireEvent.click(screen.getByRole("button", { name: /close second video/i }));
    expect(onCloseVideoTab).toHaveBeenCalledWith("video-2");

    expect(screen.getByRole("heading", { name: "Alternate" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /summary 1/i }));
    expect(onSelectSummaryTab).toHaveBeenCalledWith("summary-video-1");
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

    expect(screen.getByText("Active transcript detail").closest("li"))
      .toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Opening transcript").closest("li"))
      .not.toHaveAttribute("aria-current");
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

    expect(screen.getByText("Active audio transcript").closest("li"))
      .toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Opening audio transcript").closest("li"))
      .not.toHaveAttribute("aria-current");
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

    fireEvent.click(screen.getByRole("button", { name: /picture-in-picture/i }));

    expect(onOpenPictureInPicture).toHaveBeenCalledWith("video-1");
  });

  it("shows tooltips for video controls and the add tab button", async () => {
    render(<WorkbenchView {...defaultProps()} />);

    fireEvent.focus(screen.getByRole("button", { name: /picture-in-picture/i }));
    expect(await screen.findAllByText("Picture-in-picture player"))
      .not.toHaveLength(0);

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
    expect(screen.queryByText("**Answer** from transcript"))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New chat" }))
      .toHaveClass("h-8");
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

    expect(screen.getByRole("button", { name: "Read message" }))
      .toBeDisabled();
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

    expect(screen.getByRole("button", { name: "Read message" }))
      .not.toBeDisabled();
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

    expect(screen.queryByRole("button", { name: "Play voice message" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download voice message" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read message" }))
      .toBeInTheDocument();

    const olderBubble = screen.getByText("Answer from transcript").closest("li");
    expect(olderBubble).not.toBeNull();
    fireEvent.pointerEnter(olderBubble as HTMLElement);

    expect(screen.getByRole("button", { name: "Play voice message" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download voice message" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate voice message" }))
      .toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Pause voice message" }));

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
    expect(screen.getAllByRole("button", { name: "Copy message" }))
      .toHaveLength(1);

    fireEvent.pointerEnter(olderBubble as HTMLElement);
    expect(screen.getAllByRole("button", { name: "Copy message" }))
      .toHaveLength(2);

    fireEvent.pointerLeave(olderBubble as HTMLElement);
    expect(screen.getAllByRole("button", { name: "Copy message" }))
      .toHaveLength(1);

    fireEvent.focus(olderBubble as HTMLElement);
    expect(screen.getAllByRole("button", { name: "Copy message" }))
      .toHaveLength(2);

    fireEvent.blur(olderBubble as HTMLElement, { relatedTarget: document.body });
    expect(screen.getAllByRole("button", { name: "Copy message" }))
      .toHaveLength(1);
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
    expect(shortProviderModelName("deepseek/deepseek-v4-flash"))
      .toBe("deepseek-v4-flash");
    expect(shortProviderModelName("openai:gpt-5.4-mini"))
      .toBe("gpt-5.4-mini");
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
  artifactPath: "videos/video-1/transcript/workbench-sample_ko.txt",
  createdAtIso: "2026-05-21T00:02:00.000Z",
};

const whisperSourceVariantFixture = {
  id: "transcript-video-1-local-stt",
  videoId: "video-1",
  kind: "source" as const,
  sourceKind: "local-stt" as const,
  languageLabel: "Whisper transcription",
  segments: [
    {
      id: "local-stt-1",
      startSeconds: 12,
      endSeconds: 24,
      text: "Whisper transcript",
      sourceKind: "local-stt" as const,
    },
  ],
  artifactPath: "videos/video-1/transcript/workbench-sample_local-stt.txt",
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

function defaultProps(overrides: Partial<ComponentProps<typeof WorkbenchView>> = {}) {
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
    onVideoEnded: vi.fn(),
    onOpenPictureInPicture: vi.fn(),
    ...overrides,
  };
}
