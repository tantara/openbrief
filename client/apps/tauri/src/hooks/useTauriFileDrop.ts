import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useRef, useState } from "react";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";

type UseTauriFileDropOptions = {
  disabled?: boolean;
  onDrop(paths: string[]): Promise<void> | void;
};

export function useTauriFileDrop({
  disabled = false,
  onDrop,
}: UseTauriFileDropOptions) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const onDropRef = useRef(onDrop);
  const processingRef = useRef(false);

  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    if (disabled || !canUseTauriRuntime()) {
      setIsDraggingFiles(false);
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent(async (event) => {
        if (event.payload.type === "over") {
          setIsDraggingFiles(true);
          return;
        }

        setIsDraggingFiles(false);

        if (event.payload.type !== "drop") return;
        if (processingRef.current) return;

        processingRef.current = true;
        try {
          await onDropRef.current(event.payload.paths);
        } finally {
          window.setTimeout(() => {
            processingRef.current = false;
          }, 300);
        }
      })
      .then((callback) => {
        if (disposed) {
          callback();
          return;
        }

        unlisten = callback;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [disabled]);

  return { isDraggingFiles };
}
