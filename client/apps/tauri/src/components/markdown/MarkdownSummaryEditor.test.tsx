import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownSummaryEditor } from "@/components/markdown/MarkdownSummaryEditor";

describe("MarkdownSummaryEditor", () => {
  it("routes timestamp nodes to the caller", async () => {
    const onTimestampClick = vi.fn();
    render(
      <MarkdownSummaryEditor
        markdown="[1:15](#openbrief-timestamp-75)"
        ariaLabel="Summary"
        onTimestampClick={onTimestampClick}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Seek to 1:15" }),
    );

    expect(onTimestampClick).toHaveBeenCalledWith(75);
  });

  it("loads a frame preview when a timestamp node is hovered", async () => {
    let resolvePreview!: (preview: { imageUrl: string }) => void;
    const previewPromise = new Promise<{ imageUrl: string }>((resolve) => {
      resolvePreview = resolve;
    });
    const onTimestampPreviewRequest = vi.fn(() => previewPromise);
    render(
      <MarkdownSummaryEditor
        markdown="[1:15](#openbrief-timestamp-75)"
        ariaLabel="Summary"
        onTimestampPreviewRequest={onTimestampPreviewRequest}
      />,
    );

    fireEvent.mouseEnter(
      await screen.findByRole("button", { name: "Seek to 1:15" }),
    );

    expect(await screen.findByText("Loading frame")).toBeInTheDocument();
    expect(onTimestampPreviewRequest).toHaveBeenCalledWith(75);
    resolvePreview({ imageUrl: "asset://localhost/frame.jpg" });
    expect(
      await screen.findByRole("img", { name: "Frame preview for 1:15" }),
    ).toHaveAttribute("src", "asset://localhost/frame.jpg");
  });

  it("keeps timestamp nodes uneditable and removable", async () => {
    const onMarkdownChange = vi.fn();
    render(
      <MarkdownSummaryEditor
        markdown="Intro [1:15](#openbrief-timestamp-75) outro"
        ariaLabel="Summary"
        editable
        onMarkdownChange={onMarkdownChange}
      />,
    );

    const timestamp = await screen.findByRole("button", {
      name: "Seek to 1:15",
    });
    expect(timestamp.closest("[contenteditable='false']")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove timestamp 1:15" }));

    await waitFor(() => expect(timestamp).not.toBeInTheDocument());
    expect(onMarkdownChange).toHaveBeenCalled();
    expect(onMarkdownChange.mock.calls.at(-1)?.[0]).not.toContain(
      "#openbrief-timestamp-75",
    );
  });

  it("leaves non-timestamp seek links editable as normal markdown links", async () => {
    const onTimestampClick = vi.fn();
    render(
      <MarkdownSummaryEditor
        markdown="[Replay this point.](#openbrief-timestamp-75)"
        ariaLabel="Summary"
        onTimestampClick={onTimestampClick}
      />,
    );

    fireEvent.click(
      await screen.findByRole("link", { name: "Replay this point." }),
    );

    expect(onTimestampClick).toHaveBeenCalledWith(75);
  });
});
