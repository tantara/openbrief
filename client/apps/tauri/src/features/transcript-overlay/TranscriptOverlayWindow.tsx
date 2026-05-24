import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  transcriptOverlayEvent,
  type TranscriptOverlayPayload,
} from "@/services/transcriptOverlayService";

const initialPayload: TranscriptOverlayPayload = {
  videoTitle: "OpenBrief",
  timestamp: "0:00",
  text: "Transcript overlay is ready.",
};

export function TranscriptOverlayWindow() {
  const [payload, setPayload] = useState<TranscriptOverlayPayload>(initialPayload);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<TranscriptOverlayPayload>(transcriptOverlayEvent, (event) => {
      setPayload(event.payload);
    }).then((callback) => {
      unlisten = callback;
    });

    return () => unlisten?.();
  }, []);

  return (
    <main className="min-h-screen bg-transparent p-3">
      <section className="rounded-lg border border-white/15 bg-black/80 px-4 py-3 text-white shadow-2xl backdrop-blur">
        <div
          className="mb-2 flex items-center justify-between gap-3 text-xs text-white/65"
          data-tauri-drag-region
        >
          <span className="truncate" data-tauri-drag-region>
            {payload.videoTitle}
          </span>
          <span className="shrink-0 font-mono" data-tauri-drag-region>
            {payload.timestamp}
          </span>
        </div>
        <p className="text-base leading-relaxed">{payload.text}</p>
      </section>
    </main>
  );
}
