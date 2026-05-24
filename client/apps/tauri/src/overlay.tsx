import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import "@/overlay.css";
import { TranscriptOverlayWindow } from "@/features/transcript-overlay/TranscriptOverlayWindow";
import { I18nProvider } from "@/i18n";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <TranscriptOverlayWindow />
    </I18nProvider>
  </StrictMode>,
);
