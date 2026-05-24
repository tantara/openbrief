import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaqView } from "@/features/faq/FaqView";

describe("FaqView", () => {
  it("shows shortcuts and explains the core runtime flow", () => {
    render(<FaqView />);

    expect(screen.getByRole("heading", { name: /faq/i })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText(/open library/i)).toBeInTheDocument();
    expect(screen.getByText(/add video/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /video download/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /transcription/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /chat with ai/i })).toBeInTheDocument();
    expect(screen.getByText(/yt-dlp/i)).toBeInTheDocument();
    expect(screen.getByText(/local speech-to-text model/i)).toBeInTheDocument();
    expect(screen.getByText(/bring your own key/i)).toBeInTheDocument();
  });
});
