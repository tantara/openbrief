import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FloatingMiniPlayer } from "@/components/video/FloatingMiniPlayer";
import type { VideoAsset } from "@/domain/media-library";

describe("FloatingMiniPlayer", () => {
  it("opens the matching video in Note from the title bar action", () => {
    const onOpenWorkbench = vi.fn();

    render(
      <FloatingMiniPlayer
        media={videoFixture}
        corner="bottom-right"
        activeMediaId="video-1"
        isPlaying={false}
        currentTimeSeconds={0}
        onPositionChange={vi.fn()}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onTimeUpdate={vi.fn()}
        onEnded={vi.fn()}
        onOpenWorkbench={onOpenWorkbench}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /note/i }));

    expect(screen.getByLabelText("Picture-in-picture player")).toHaveClass(
      "rounded-xl",
    );
    expect(onOpenWorkbench).toHaveBeenCalledTimes(1);
  });

  it("lets the embedded player expand outside the draggable PiP container", () => {
    render(
      <FloatingMiniPlayer
        media={videoFixture}
        corner="bottom-right"
        activeMediaId="video-1"
        isPlaying={false}
        currentTimeSeconds={0}
        onPositionChange={vi.fn()}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onTimeUpdate={vi.fn()}
        onEnded={vi.fn()}
        onOpenWorkbench={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /enter fullscreen/i }));

    const fullscreenContainer = screen.getByLabelText("PiP sample").parentElement;
    const miniPlayer = screen.getByLabelText("Picture-in-picture player");

    expect(fullscreenContainer).toHaveClass("fixed");
    expect(fullscreenContainer?.parentElement).toBe(document.body);
    expect(miniPlayer).not.toContainElement(fullscreenContainer);
  });

  it("uses the shared PiP shell for audio assets", () => {
    render(
      <FloatingMiniPlayer
        media={audioFixture}
        corner="bottom-right"
        activeMediaId="audio-1"
        isPlaying={false}
        currentTimeSeconds={0}
        onPositionChange={vi.fn()}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onTimeUpdate={vi.fn()}
        onEnded={vi.fn()}
        onOpenWorkbench={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Audio PiP sample")).not.toHaveLength(0);
    expect(screen.getByLabelText("Audio PiP sample", { selector: "audio" }))
      .toHaveAttribute("src", "audio/local-audio-pip/sample.mp3");
    expect(screen.getByRole("button", { name: /play audio pip sample/i }))
      .toBeInTheDocument();
    expect(screen.queryByLabelText("PiP sample", { selector: "video" }))
      .not.toBeInTheDocument();
  });

  it("persists a clamped position after dragging", () => {
    const onPositionChange = vi.fn();
    const setPointerCapture = vi.fn();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
    Element.prototype.setPointerCapture = setPointerCapture;
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      bottom: 554,
      height: 254,
      left: 400,
      right: 780,
      top: 300,
      width: 380,
      x: 400,
      y: 300,
      toJSON: () => ({}),
    }));

    render(
      <FloatingMiniPlayer
        media={videoFixture}
        corner="bottom-right"
        activeMediaId="video-1"
        isPlaying={false}
        currentTimeSeconds={0}
        onPositionChange={onPositionChange}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onTimeUpdate={vi.fn()}
        onEnded={vi.fn()}
        onOpenWorkbench={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dragHandle = screen.getByText("PiP sample").closest("div")?.parentElement;
    expect(dragHandle).toBeTruthy();

    firePointerEvent(dragHandle!, "pointerdown", {
      clientX: 420,
      clientY: 320,
      pointerId: 1,
    });
    firePointerEvent(dragHandle!, "pointermove", {
      clientX: 760,
      clientY: 560,
      pointerId: 1,
    });
    firePointerEvent(dragHandle!, "pointerup", {
      clientX: 760,
      clientY: 560,
      pointerId: 1,
    });

    expect(setPointerCapture).toHaveBeenCalled();
    expect(onPositionChange).toHaveBeenCalledWith(
      { x: 404, y: 330 },
      { width: 800, height: 600 },
      { width: 380, height: 254 },
    );
  });
});

const videoFixture: VideoAsset = {
  id: "video-1",
  title: "PiP sample",
  sourceKind: "local-file",
  originalUri: "/tmp/sample.mp4",
  libraryPath: "videos/video-1/source.mp4",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

const audioFixture: VideoAsset = {
  id: "audio-1",
  title: "Audio PiP sample",
  sourceKind: "local-file",
  sourceType: "audio",
  originalUri: "/tmp/sample.mp3",
  libraryPath: "audio/local-audio-pip/sample.mp3",
  importStatus: "ready",
  createdAtIso: "2026-05-21T00:00:00.000Z",
};

function firePointerEvent(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: { clientX: number; clientY: number; pointerId: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  fireEvent(element, event);
}
