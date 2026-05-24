import type {
  QwenPresetVoiceId,
  SupertonicVoiceStyleId,
  TtsLanguageCode,
  TtsModelId,
} from "@/services/ttsSettingsService";
import type {
  GenerateTtsPreviewRequest,
  SaveTtsPreviewAudioRequest,
  TtsPreviewResult,
  TtsVoiceCatalogModel,
} from "@/services/voiceService";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import { defaultLanguageForModel } from "@/services/ttsSettingsService";
import {
  createTtsPreviewDefaultFileName,
  generateTtsPreview,
  listTtsVoices,
  saveTtsPreviewAudio,
} from "@/services/voiceService";
import {
  Download,
  Loader2,
  MessageCircle,
  Radio,
  RefreshCw,
  Volume2,
} from "lucide-react";

import { synthesisLanguagesForModel } from "@acme/model-card";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import { Textarea } from "@acme/ui/textarea";

type VoicesViewProps = {
  loadVoices?: () => Promise<TtsVoiceCatalogModel[]>;
  onGeneratePreview?: (
    request: GenerateTtsPreviewRequest,
  ) => Promise<TtsPreviewResult>;
  onSavePreviewAudio?: (
    request: SaveTtsPreviewAudioRequest,
  ) => Promise<unknown>;
};

const defaultPreviewText =
  "Welcome to OpenBrief. This is a short voice preview.";

export function VoicesView({
  loadVoices = listTtsVoices,
  onGeneratePreview = generateTtsPreview,
  onSavePreviewAudio = saveTtsPreviewAudio,
}: VoicesViewProps) {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<TtsVoiceCatalogModel[]>([]);
  const [selectedVoiceKey, setSelectedVoiceKey] = useState("");
  const [languageCode, setLanguageCode] = useState<TtsLanguageCode>("en");
  const [text, setText] = useState(defaultPreviewText);
  const [preview, setPreview] = useState<TtsPreviewResult>();
  const [previewText, setPreviewText] = useState("");
  const [previewVoiceName, setPreviewVoiceName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const voiceOptions = useMemo(
    () =>
      catalog.flatMap((model) =>
        model.voices.map((voice) => ({
          key: voiceOptionKey(model.id, voice.id),
          model,
          voice,
        })),
      ),
    [catalog],
  );
  const selectedVoice =
    voiceOptions.find((option) => option.key === selectedVoiceKey) ??
    voiceOptions[0];
  const selectedModelId = selectedVoice?.model.id;
  const languageOptions = selectedModelId
    ? synthesisLanguagesForModel(selectedModelId)
    : [];

  useEffect(() => {
    let disposed = false;

    async function refresh() {
      setIsLoading(true);
      setErrorMessage(undefined);
      try {
        const voices = await loadVoices();
        if (disposed) return;
        setCatalog(voices);
        const firstVoice = voices[0]?.voices[0];
        if (firstVoice) {
          const firstKey = voiceOptionKey(voices[0].id, firstVoice.id);
          setSelectedVoiceKey((current) =>
            voices.some((model) =>
              model.voices.some(
                (voice) => voiceOptionKey(model.id, voice.id) === current,
              ),
            )
              ? current
              : firstKey,
          );
        }
      } catch (error) {
        if (!disposed) setErrorMessage(errorMessageFromUnknown(error));
      } finally {
        if (!disposed) setIsLoading(false);
      }
    }

    void refresh();
    return () => {
      disposed = true;
    };
  }, [loadVoices]);

  useEffect(() => {
    if (!selectedModelId) return;
    const supportsLanguage = languageOptions.some(
      (language) => language.code === languageCode,
    );
    if (!supportsLanguage) {
      setLanguageCode(defaultLanguageForModel(selectedModelId));
    }
  }, [languageCode, languageOptions, selectedModelId]);

  useEffect(
    () => () => {
      revokeObjectUrl(preview?.audioUrl);
    },
    [preview?.audioUrl],
  );

  async function refreshCatalog() {
    setIsLoading(true);
    setErrorMessage(undefined);
    try {
      setCatalog(await loadVoices());
    } catch (error) {
      setErrorMessage(errorMessageFromUnknown(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVoice || !text.trim()) return;

    setIsGenerating(true);
    setErrorMessage(undefined);
    try {
      const nextPreview = await onGeneratePreview({
        text,
        modelId: selectedVoice.model.id,
        language: languageCode,
        voiceStyleId:
          selectedVoice.model.engine === "supertonic"
            ? (selectedVoice.voice.id as SupertonicVoiceStyleId)
            : undefined,
        qwenPresetVoiceId:
          selectedVoice.model.engine === "qwen"
            ? (selectedVoice.voice.id as QwenPresetVoiceId)
            : undefined,
      });
      revokeObjectUrl(preview?.audioUrl);
      setPreview(nextPreview);
      setPreviewText(text);
      setPreviewVoiceName(selectedVoice.voice.label);
      setCatalog(await loadVoices());
    } catch (error) {
      setErrorMessage(errorMessageFromUnknown(error));
    } finally {
      setIsGenerating(false);
    }
  }

  async function savePreviewAudio() {
    if (!preview || isSavingPreview) return;

    setIsSavingPreview(true);
    setErrorMessage(undefined);
    try {
      await onSavePreviewAudio({
        audioBytes: preview.audioBytes,
        defaultFileName: createTtsPreviewDefaultFileName(
          previewText || text,
          previewVoiceName,
        ),
      });
    } catch (error) {
      setErrorMessage(errorMessageFromUnknown(error));
    } finally {
      setIsSavingPreview(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>{t("voices.preview.title")}</CardTitle>
            <CardDescription>{t("voices.preview.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={submitPreview}>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(12rem,0.7fr)_auto]">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">
                    {t("voices.preview.voice")}
                  </span>
                  <Select
                    value={selectedVoice?.key ?? ""}
                    disabled={isLoading || voiceOptions.length === 0}
                    onValueChange={setSelectedVoiceKey}
                  >
                    <SelectTrigger aria-label={t("voices.preview.voice")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.map((model, index) => (
                        <SelectGroup key={model.id}>
                          {index > 0 ? <SelectSeparator /> : null}
                          <SelectLabel>{model.name}</SelectLabel>
                          {model.voices.map((voice) => (
                            <SelectItem
                              key={voiceOptionKey(model.id, voice.id)}
                              value={voiceOptionKey(model.id, voice.id)}
                            >
                              {voice.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">
                    {t("voices.preview.language")}
                  </span>
                  <Select
                    value={languageCode}
                    disabled={!selectedModelId}
                    onValueChange={(value) =>
                      setLanguageCode(value as TtsLanguageCode)
                    }
                  >
                    <SelectTrigger aria-label={t("voices.preview.language")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languageOptions.map((language) => (
                        <SelectItem key={language.code} value={language.code}>
                          {language.label} ({language.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <Button
                  type="submit"
                  className="self-end"
                  disabled={isGenerating || !selectedVoice || !text.trim()}
                >
                  {isGenerating ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isGenerating
                    ? t("voices.preview.generating")
                    : t("voices.preview.generate")}
                </Button>
              </div>
              <label
                className="grid gap-1 text-sm"
                htmlFor="voices-preview-text"
              >
                <span className="font-medium">{t("voices.preview.text")}</span>
                <Textarea
                  id="voices-preview-text"
                  value={text}
                  rows={3}
                  onChange={(event) => setText(event.target.value)}
                />
              </label>
            </form>
            {preview ? (
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <audio
                    controls
                    src={preview.audioUrl}
                    className="min-w-0 flex-1"
                    aria-label={t("voices.preview.audio")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void savePreviewAudio()}
                    disabled={isSavingPreview}
                  >
                    {isSavingPreview ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden="true" />
                    )}
                    {t("voices.preview.download")}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("voices.preview.ready", {
                    size: formatBytes(preview.sizeBytes),
                  })}
                </p>
              </div>
            ) : null}
            {errorMessage ? (
              <p className="text-destructive mt-4 text-sm">
                {t("voices.error", { message: errorMessage })}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>{t("voices.usage.title")}</CardTitle>
            <CardDescription>{t("voices.usage.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <VoiceUsageItem
                icon={<Radio className="h-4 w-4" aria-hidden="true" />}
                title={t("voices.usage.podcast.title")}
                description={t("voices.usage.podcast.description")}
              />
              <VoiceUsageItem
                icon={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
                title={t("voices.usage.chat.title")}
                description={t("voices.usage.chat.description")}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t("voices.catalog.title")}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refreshCatalog()}
          disabled={isLoading}
        >
          <RefreshCw
            className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            aria-hidden="true"
          />
          {t("voices.catalog.refresh")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {catalog.map((model) => (
          <Card key={model.id}>
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{model.name}</CardTitle>
                  <CardDescription>{model.id}</CardDescription>
                </div>
                <StatusBadge downloaded={model.downloaded} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {model.voices.map((voice) => (
                  <button
                    type="button"
                    key={voice.id}
                    className="border-border hover:bg-muted/60 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition"
                    onClick={() =>
                      setSelectedVoiceKey(voiceOptionKey(model.id, voice.id))
                    }
                  >
                    <span className="font-medium">{voice.label}</span>
                    <StatusBadge downloaded={voice.downloaded} />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && catalog.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-sm">
            {t("voices.catalog.empty")}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StatusBadge({ downloaded }: { downloaded: boolean }) {
  const { t } = useI18n();

  return (
    <Badge variant={downloaded ? "default" : "outline"} className="shrink-0">
      {downloaded ? t("voices.status.ready") : t("voices.status.notDownloaded")}
    </Badge>
  );
}

function VoiceUsageItem({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="border-border flex gap-3 rounded-md border p-3">
      <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
    </div>
  );
}

function voiceOptionKey(modelId: TtsModelId, voiceId: string) {
  return `${modelId}::${voiceId}`;
}

function errorMessageFromUnknown(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function revokeObjectUrl(audioUrl: string | undefined) {
  if (audioUrl && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(audioUrl);
  }
}
