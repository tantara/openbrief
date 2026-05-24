import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { TranscriptOverlayWindow } from "@/features/transcript-overlay/TranscriptOverlayWindow";
import {
  transcriptOverlayEvent,
  type TranscriptOverlayPayload,
} from "@/services/transcriptOverlayService";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("TranscriptOverlayWindow", () => {
  beforeEach(() => {
    vi.mocked(listen).mockResolvedValue(() => {});
  });

  it("renders a draggable transparent overlay shell", () => {
    render(<TranscriptOverlayWindow onHide={vi.fn()} />);

    const overlay = screen.getByLabelText("Transcript overlay");
    const dragHandle = screen.getByText("OpenBrief").closest("[data-tauri-drag-region]");

    expect(overlay).toHaveClass("bg-black/80");
    expect(overlay).toHaveClass("rounded-xl");
    expect(overlay).toHaveClass("border-0");
    expect(overlay).toHaveClass("shadow-none");
    expect(overlay).not.toHaveClass("border-border");
    expect(dragHandle).toBeTruthy();
    expect(screen.getByText("Transcript overlay is ready.")).toBeInTheDocument();
  });

  it("updates transcript content from the overlay event", async () => {
    let handler:
      | ((event: { event: string; id: number; payload: TranscriptOverlayPayload }) => void)
      | undefined;
    vi.mocked(listen).mockImplementation(async (_eventName, callback) => {
      handler = callback as typeof handler;
      return () => {};
    });

    render(<TranscriptOverlayWindow onHide={vi.fn()} />);

    expect(listen).toHaveBeenCalledWith(transcriptOverlayEvent, expect.any(Function));
    handler?.({
      event: transcriptOverlayEvent,
      id: 1,
      payload: {
        videoTitle: "Demo video",
        timestamp: "1:23",
        text: "Current transcript line",
        nextText: "Upcoming transcript line",
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Current transcript line")).toBeInTheDocument();
    });
    expect(screen.getByText("Upcoming transcript line")).toHaveClass("text-white/45");
    expect(screen.getByText("Demo video")).toBeInTheDocument();
    expect(screen.getByText("1:23")).toBeInTheDocument();
  });

  it("hides the overlay from the close button", () => {
    const onHide = vi.fn();

    render(<TranscriptOverlayWindow onHide={onHide} />);

    fireEvent.click(screen.getByRole("button", { name: "Close transcript overlay" }));

    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
