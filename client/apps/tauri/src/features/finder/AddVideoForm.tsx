import { Link, Upload } from "lucide-react";
import { useState } from "react";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import { Input } from "@acme/ui/input";
import { classifyVideoProviderUrl } from "@/domain/helper-protocol";
import {
  createLocalFileDialogService,
  type LocalFileDialogService,
} from "@/services/localFileDialogService";
import { openExternalWebUrl } from "@/services/externalUrlService";
import { useI18n } from "@/i18n";

type AddVideoFormProps = {
  onImportLocalFile(sourcePath: string): Promise<unknown>;
  onImportYoutubeUrl(url: string): Promise<unknown>;
  fileDialogService?: LocalFileDialogService;
  inputId?: string;
  onImportComplete?(): void;
  feedbackUrlOpener?(url: string): Promise<unknown>;
};

export function AddVideoForm({
  onImportLocalFile,
  onImportYoutubeUrl,
  fileDialogService = createLocalFileDialogService(),
  inputId = "video-url",
  onImportComplete,
  feedbackUrlOpener = openExternalWebUrl,
}: AddVideoFormProps) {
  const { t } = useI18n();
  const [videoUrl, setVideoUrl] = useState("");
  const [isImportingLocal, setIsImportingLocal] = useState(false);
  const [isUnsupportedDomainDialogOpen, setIsUnsupportedDomainDialogOpen] =
    useState(false);
  const urlClassification = videoUrl.trim()
    ? classifyVideoProviderUrl(videoUrl.trim())
    : undefined;

  async function submitLocalImport() {
    setIsImportingLocal(true);
    try {
      const sourcePath = await fileDialogService.selectVideoFile();

      if (sourcePath) {
        await onImportLocalFile(sourcePath);
        onImportComplete?.();
      }
    } finally {
      setIsImportingLocal(false);
    }
  }

  async function submitUrlImport() {
    const submittedUrl = videoUrl.trim();
    if (!submittedUrl) return;

    if (classifyVideoProviderUrl(submittedUrl).kind === "unsupported-provider") {
      setIsUnsupportedDomainDialogOpen(true);
      return;
    }

    await onImportYoutubeUrl(submittedUrl);
    setVideoUrl("");
    onImportComplete?.();
  }

  return (
    <>
      <div className="space-y-3">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void submitUrlImport();
          }}
        >
          <label className="sr-only" htmlFor={inputId}>
            {t("finder.import.urlLabel")}
          </label>
          <Input
            id={inputId}
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder={t("finder.import.urlPlaceholder")}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={!videoUrl.trim()}>
            <Link className="h-4 w-4" aria-hidden="true" />
            {t("finder.import.add")}
          </Button>
        </form>
        {urlClassification ? <ProviderBadge classification={urlClassification} /> : null}
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center"
          disabled={isImportingLocal}
          onClick={() => void submitLocalImport()}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {t("finder.import.video")}
        </Button>
      </div>
      <Dialog
        open={isUnsupportedDomainDialogOpen}
        onOpenChange={setIsUnsupportedDomainDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finder.unsupportedUrl.title")}</DialogTitle>
            <DialogDescription>
              {t("finder.unsupportedUrl.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                void feedbackUrlOpener("https://openbrief.app");
              }}
            >
              {t("finder.unsupportedUrl.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProviderBadge({
  classification,
}: {
  classification: ReturnType<typeof classifyVideoProviderUrl>;
}) {
  const { t } = useI18n();

  if (classification.kind === "unsupported-provider") {
    return <Badge className="text-muted-foreground">{t("finder.provider.unsupported")}</Badge>;
  }

  return (
    <Badge className="text-muted-foreground">
      {classification.label} ·{" "}
      {classification.kind === "single-video"
        ? t("finder.provider.singleVideo")
        : t("finder.provider.unsupportedCollection")}
    </Badge>
  );
}
