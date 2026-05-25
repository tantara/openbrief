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
  it("shows a native editor agent pane that can apply a component-aware plan", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Apply plan" }));

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
    expect(screen.getByRole("button", { name: "Apply plan" })).toBeDisabled();
    expect(onSaveComposition).not.toHaveBeenCalled();
  });
});
