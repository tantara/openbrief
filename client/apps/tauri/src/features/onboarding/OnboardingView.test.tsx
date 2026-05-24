import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingView } from "@/features/onboarding/OnboardingView";

describe("OnboardingView", () => {
  it("explains the first-run OpenBrief workflow", () => {
    render(<OnboardingView onFinish={() => {}} />);

    expect(screen.getByRole("heading", { name: /turn videos/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /choose your color/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /add a video/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /extract the transcript/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /connect ai/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /summarize and chat/i })).toBeInTheDocument();
    expect(screen.getByText(/provider secrets stay/i)).toBeInTheDocument();
  });

  it("finishes onboarding from the primary action", () => {
    const onFinish = vi.fn();

    render(<OnboardingView onFinish={onFinish} />);

    fireEvent.click(screen.getByRole("button", { name: /start with videos/i }));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("lets first-run users choose an accent color", () => {
    const onColorSeedChange = vi.fn();

    render(
      <OnboardingView
        appColorSeed="green"
        onColorSeedChange={onColorSeedChange}
        onFinish={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Red" }));

    expect(onColorSeedChange).toHaveBeenCalledWith("red");
  });
});
