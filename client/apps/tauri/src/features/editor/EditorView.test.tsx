import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EditorAgentService } from "@/services/editorAgentService";
import { EditorView } from "@/features/editor/EditorView";

vi.mock("@hyperframes/player", () => ({}));

const video = {
  id: "video-1",
  title: "Strategy Review",
  sourceKind: "local-file" as const,
  originalUri: "file:///strategy.mp4",
  libraryPath: "videos/video-1/strategy.mp4",
  importStatus: "ready" as const,
  createdAtIso: "2026-05-25T00:00:00.000Z",
};

const transcript = [
  {
    id: "seg-1",
    startSeconds: 0,
    endSeconds: 8,
    text: "Native first success.",
    sourceKind: "local-stt" as const,
  },
];

describe("EditorView", () => {
  it("executes safe component-aware composition plans without a manual apply step", async () => {
    const onSaveComposition = vi.fn();
    const editorAgentService = {
      draftPlan: vi.fn(async () => ({
        kind: "composition" as const,
        summary: "Drafted a native short.",
        scenario: "summary-to-video" as const,
        direction: "Create a short with wipe captions.",
        componentNames: ["caption-clip-wipe" as const],
        storyboard: [
          {
            title: "Hook",
            narration: "Start with the strongest point.",
            startSeconds: 0,
            durationSeconds: 8,
          },
        ],
        transcriptEdit: { cuts: [], renderNotes: [] },
        validation: { ok: true, errors: [], warnings: [] },
      })),
    } satisfies EditorAgentService;

    render(
      <EditorView
        videos={[video]}
        selectedVideoId={video.id}
        selectedVideo={video}
        selectedTranscript={transcript}
        compositionHistory={[]}
        rendersByCompositionId={{}}
        onSelectVideo={vi.fn()}
        onSaveComposition={onSaveComposition}
        onSaveRender={vi.fn()}
        editorAgentService={editorAgentService}
      />,
    );

    expect(screen.getByText("Editor agent")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wipe captions" }));

    await waitFor(() =>
      expect(editorAgentService.draftPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          instruction: "Add high-energy TikTok-style wipe captions.",
          kind: "composition",
        }),
      ),
    );
    expect(await screen.findByText("Drafted a native short.")).toBeInTheDocument();

    await waitFor(() => expect(onSaveComposition).toHaveBeenCalledTimes(1));
    expect(onSaveComposition.mock.calls[0][0]).toMatchObject({
      components: [
        expect.objectContaining({
          name: "caption-clip-wipe",
        }),
      ],
      storyboard: [
        expect.objectContaining({
          title: "Hook",
          narration: "Start with the strongest point.",
        }),
      ],
    });
  });

  it("does not apply transcript-edit plans as rendered compositions", async () => {
    const onSaveComposition = vi.fn();
    const editorAgentService = {
      draftPlan: vi.fn(async () => ({
        kind: "transcript-edit" as const,
        summary: "Drafted conservative cuts.",
        scenario: "summary-to-video" as const,
        direction: "Remove fillers before rendering.",
        componentNames: [],
        storyboard: [],
        transcriptEdit: {
          cuts: [{ startSeconds: 0, endSeconds: 1, reason: "Filler." }],
          renderNotes: ["Review cuts before rendering."],
        },
        validation: { ok: true, errors: [], warnings: [] },
      })),
    } satisfies EditorAgentService;

    render(
      <EditorView
        videos={[video]}
        selectedVideoId={video.id}
        selectedVideo={video}
        selectedTranscript={transcript}
        compositionHistory={[]}
        rendersByCompositionId={{}}
        onSelectVideo={vi.fn()}
        onSaveComposition={onSaveComposition}
        onSaveRender={vi.fn()}
        editorAgentService={editorAgentService}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cut fillers" }));

    expect(await screen.findByText("Drafted conservative cuts.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply plan" }),
    ).not.toBeInTheDocument();
    expect(onSaveComposition).not.toHaveBeenCalled();
  });

  it("frames vertical compositions without stretching the preview", () => {
    render(
      <EditorView
        videos={[video]}
        selectedVideoId={video.id}
        selectedVideo={video}
        selectedTranscript={transcript}
        latestComposition={{
          id: "composition-vertical",
          sourceId: video.id,
          sourceType: "video",
          scenario: "summary-to-video",
          adapter: "deno-hyperframes",
          title: "Vertical Short",
          prompt: "Portrait preview",
          html: "<html><body>Vertical</body></html>",
          entryPath: "videos/video-1/generated-video/composition-vertical/index.html",
          manifestPath:
            "videos/video-1/generated-video/composition-vertical/composition.json",
          renderPath:
            "videos/video-1/generated-video/composition-vertical/render.mp4",
          durationSeconds: 10,
          aspectRatio: "9:16",
          createdAtIso: "2026-05-25T00:00:00.000Z",
          updatedAtIso: "2026-05-25T00:00:00.000Z",
        }}
        compositionHistory={[]}
        rendersByCompositionId={{}}
        onSelectVideo={vi.fn()}
        onSaveComposition={vi.fn()}
        onSaveRender={vi.fn()}
      />,
    );

    const frame = screen.getByTestId("editor-preview-frame");
    expect(frame).toHaveAttribute("data-preview-aspect", "9:16");
    expect(frame).toHaveClass("aspect-[9/16]");
  });
});
