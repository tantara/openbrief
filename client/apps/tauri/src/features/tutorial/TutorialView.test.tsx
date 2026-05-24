import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TutorialView } from "@/features/tutorial/TutorialView";

describe("TutorialView", () => {
  it("explains the core video workflow", () => {
    render(<TutorialView />);

    expect(screen.getByRole("heading", { name: /download video/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /transcription/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /summary/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /chat/i })).toBeInTheDocument();
    expect(screen.getByText(/queues downloads/i)).toBeInTheDocument();
    expect(screen.getByText(/local whisper model/i)).toBeInTheDocument();
  });

  it("can reopen onboarding from the tutorial", () => {
    const onOpenOnboarding = vi.fn();

    render(<TutorialView onOpenOnboarding={onOpenOnboarding} />);

    fireEvent.click(screen.getByRole("button", { name: "See onboarding" }));

    expect(onOpenOnboarding).toHaveBeenCalledTimes(1);
  });
});
