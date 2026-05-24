import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddVideoForm } from "@/features/finder/AddVideoForm";

describe("AddVideoForm", () => {
  it("submits supported video provider URLs", async () => {
    const onImportYoutubeUrl = vi.fn().mockResolvedValue(undefined);

    render(
      <AddVideoForm
        onImportLocalFile={vi.fn().mockResolvedValue(undefined)}
        onImportYoutubeUrl={onImportYoutubeUrl}
      />,
    );

    fireEvent.change(screen.getByLabelText(/video url/i), {
      target: { value: "https://www.youtube.com/watch?v=abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(onImportYoutubeUrl).toHaveBeenCalledWith(
        "https://www.youtube.com/watch?v=abc123",
      );
    });
  });

  it("blocks unsupported video domains and opens the feedback target", async () => {
    const onImportYoutubeUrl = vi.fn().mockResolvedValue(undefined);
    const feedbackUrlOpener = vi.fn().mockResolvedValue(undefined);

    render(
      <AddVideoForm
        onImportLocalFile={vi.fn().mockResolvedValue(undefined)}
        onImportYoutubeUrl={onImportYoutubeUrl}
        feedbackUrlOpener={feedbackUrlOpener}
      />,
    );

    fireEvent.change(screen.getByLabelText(/video url/i), {
      target: { value: "https://www.instagram.com/reel/example" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "URL is not supported for now. Submit feedback to support a new video platform.",
    );
    expect(onImportYoutubeUrl).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /submit feedback/i }));

    expect(feedbackUrlOpener).toHaveBeenCalledWith("https://openbrief.app");
  });
});
