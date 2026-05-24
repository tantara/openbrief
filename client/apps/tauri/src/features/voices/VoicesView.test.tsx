import type { TtsVoiceCatalogModel } from "@/services/voiceService";
import { VoicesView } from "@/features/voices/VoicesView";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const catalog: TtsVoiceCatalogModel[] = [
  {
    id: "Supertone/supertonic-3",
    name: "Supertonic 3",
    engine: "supertonic",
    downloaded: true,
    voices: [
      { id: "M1", label: "Mark (M1)", downloaded: true },
      { id: "F2", label: "Sophia (F2)", downloaded: true },
    ],
  },
  {
    id: "qwen-tts-0.6B",
    name: "Qwen3-TTS 0.6B",
    engine: "qwen",
    downloaded: false,
    voices: [{ id: "default", label: "Default", downloaded: false }],
  },
];

describe("VoicesView", () => {
  it("groups voices by model and shows readiness badges", async () => {
    render(<VoicesView loadVoices={async () => catalog} />);

    const supertonicCard = await screen.findByRole("heading", {
      name: "Supertonic 3",
    });
    const qwenCard = screen.getByRole("heading", { name: "Qwen3-TTS 0.6B" });

    expect(supertonicCard).toBeInTheDocument();
    expect(qwenCard).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mark \(m1\).*ready/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /default.*not downloaded/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How you can use voice" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Podcast generation")).toBeInTheDocument();
    expect(screen.getByText("Read chat messages")).toBeInTheDocument();
  });

  it("generates a preview from the selected voice", async () => {
    const onGeneratePreview = vi.fn(async () => ({
      modelId: "qwen-tts-0.6B" as const,
      voiceId: "default",
      language: "en" as const,
      sizeBytes: 2048,
      audioUrl: "blob:voice-preview",
      audioBytes: new Uint8Array([1, 2, 3]),
    }));
    const onSavePreviewAudio = vi.fn(async () => undefined);

    render(
      <VoicesView
        loadVoices={async () => catalog}
        onGeneratePreview={onGeneratePreview}
        onSavePreviewAudio={onSavePreviewAudio}
      />,
    );

    fireEvent.keyDown(await screen.findByLabelText("Voice"), {
      key: "Enter",
      code: "Enter",
    });
    fireEvent.click(await screen.findByRole("option", { name: "Default" }));
    fireEvent.change(screen.getByLabelText("Text"), {
      target: { value: "Generate this simple preview." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^generate$/i }));

    await waitFor(() => {
      expect(onGeneratePreview).toHaveBeenCalledWith({
        text: "Generate this simple preview.",
        modelId: "qwen-tts-0.6B",
        language: "en",
        voiceStyleId: undefined,
        qwenPresetVoiceId: "default",
      });
    });

    expect(screen.getByLabelText("Voice preview audio")).toHaveAttribute(
      "src",
      "blob:voice-preview",
    );
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(onSavePreviewAudio).toHaveBeenCalledWith({
        audioBytes: new Uint8Array([1, 2, 3]),
        defaultFileName: "Generate this simple_Default.wav",
      });
    });
    expect(screen.getByText("Preview ready (2 KB)")).toBeInTheDocument();
  });
});
