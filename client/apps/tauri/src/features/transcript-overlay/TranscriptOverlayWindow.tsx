import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import { cn } from "@acme/ui";
import { useI18n } from "@/i18n";
import {
  hideTranscriptOverlay,
  transcriptOverlayEvent,
  type TranscriptOverlayPayload,
} from "@/services/transcriptOverlayService";

const initialPayload: TranscriptOverlayPayload = {
  videoTitle: "OpenBrief",
  timestamp: "0:00",
  text: "Transcript overlay is ready.",
};

type TranscriptOverlayWindowProps = {
  onHide?: () => Promise<boolean> | boolean;
};

export function TranscriptOverlayWindow({
  onHide = hideTranscriptOverlay,
}: TranscriptOverlayWindowProps = {}) {
  const { t } = useI18n();
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
    <main className="min-h-screen bg-transparent">
      <section
        className="min-h-screen overflow-hidden rounded-xl bg-black/80 text-white shadow-2xl backdrop-blur"
        aria-label={t("transcriptOverlay.window")}
      >
        <div className="flex select-none items-center justify-between gap-3 px-4 py-2 text-xs text-white/65">
          <div
            className="flex min-w-0 flex-1 cursor-grab items-center gap-3 active:cursor-grabbing"
            data-tauri-drag-region
          >
            <span className="truncate" data-tauri-drag-region>
              {payload.videoTitle}
            </span>
            <span className="shrink-0 font-mono" data-tauri-drag-region>
              {payload.timestamp}
            </span>
          </div>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              "text-white/70 transition hover:bg-white/10 hover:text-white",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            )}
            aria-label={t("transcriptOverlay.close")}
            title={t("transcriptOverlay.close")}
            onClick={() => {
              void onHide();
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="px-4 pb-3 text-base leading-relaxed">{payload.text}</p>
      </section>
    </main>
  );
}
