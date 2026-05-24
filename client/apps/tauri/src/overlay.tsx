import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import { TranscriptOverlayWindow } from "@/features/transcript-overlay/TranscriptOverlayWindow";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TranscriptOverlayWindow />
  </StrictMode>,
);
