import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import type { VideoAsset } from "@/domain/media-library";
import { useI18n } from "@/i18n";
import { resolveLibraryAssetUrl } from "@/services/libraryAssetUrl";
import { canUseTauriRuntime } from "@/services/tauriHelperClient";

type PdfViewerProps = {
  media: VideoAsset;
};

export function PdfViewer({ media }: PdfViewerProps) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | undefined>(() =>
    canUseTauriRuntime() ? undefined : media.libraryPath,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolvePdf() {
      setFailed(false);
      setSrc(canUseTauriRuntime() ? undefined : media.libraryPath);

      try {
        const resolvedSrc = await resolveLibraryAssetUrl(media.libraryPath);

        if (!cancelled) {
          setSrc(resolvedSrc);
        }
      } catch {
        if (!cancelled) {
          setSrc(undefined);
          setFailed(true);
        }
      }
    }

    void resolvePdf();

    return () => {
      cancelled = true;
    };
  }, [media.libraryPath]);

  if (!src) {
    return (
      <div className="flex aspect-[4/5] min-h-96 flex-col items-center justify-center gap-3 rounded-md bg-muted p-5 text-center text-sm text-muted-foreground">
        <FileText className="h-8 w-8" aria-hidden="true" />
        {failed ? t("pdf.viewer.fileUnavailable") : t("pdf.viewer.loading")}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-muted">
      <iframe
        title={media.title}
        src={src}
        className="min-h-96 flex-1 bg-background"
        aria-label={media.title}
        onError={() => {
          setSrc(undefined);
          setFailed(true);
        }}
      />
    </div>
  );
}
