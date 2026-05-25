import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, KeyRound, MessageCircle, Subtitles } from "lucide-react";
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
import {
  getSttModelCompatibility,
  type CompatibilityFeature,
} from "@/domain/compatibility";
import type { ProviderKind } from "@/domain/media-library";
import {
  providerLabels,
  providerModelOptions,
  providerOptions,
} from "@/domain/provider";
import { formatModelSize } from "@/domain/settings";
import type { ProviderAuthMode, SettingsSnapshot } from "@/domain/settings";
import type { SttModelDownloadOptions } from "@/services/setupService";
import { useI18n } from "@/i18n";

export type SetupDialogMode = "transcription" | "summary" | "chat" | "provider";

type SetupDialogProps = {
  open: boolean;
  mode: SetupDialogMode;
  settings?: SettingsSnapshot;
  selectedWhisperModelId: string;
  provider: ProviderKind;
  providerModel: string;
  onClose(): void;
  onWhisperModelChange(modelId: string): void;
  onProviderChange(provider: ProviderKind): void;
  onProviderModelChange(model: string): void;
  onDownloadWhisperModel(
    modelId: string,
    options?: SttModelDownloadOptions,
  ): Promise<unknown>;
  onSaveProviderApiKey(provider: ProviderKind, apiKey: string): Promise<unknown>;
  onContinue(): Promise<unknown>;
};

export function SetupDialog({
  open,
  mode,
  settings,
  selectedWhisperModelId,
  provider,
  providerModel,
  onClose,
  onWhisperModelChange,
  onProviderChange,
  onProviderModelChange,
  onDownloadWhisperModel,
  onSaveProviderApiKey,
  onContinue,
}: SetupDialogProps) {
  const { t } = useI18n();
  const [providerAuthMode, setProviderAuthMode] =
    useState<ProviderAuthMode>("api-key");
  const [isSaving, setIsSaving] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [downloadingModelId, setDownloadingModelId] = useState<string | undefined>();
  const [downloadProgressPercent, setDownloadProgressPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [pendingCompatibilityWarning, setPendingCompatibilityWarning] =
    useState<CompatibilityFeature | undefined>();

  const selectedWhisperModel = settings?.stt.models.find(
    (model) => model.id === selectedWhisperModelId,
  );
  const providerStatus = settings?.llm.accounts.find(
    (account) => account.provider === provider,
  );
  const providerConfigured = Boolean(providerStatus?.configured);
  const isTranscription = mode === "transcription";
  const canContinue = isTranscription
    ? Boolean(selectedWhisperModel?.downloaded)
    : providerConfigured;

  useEffect(() => {
    if (provider !== "openai" && providerAuthMode === "oauth-subscription") {
      setProviderAuthMode("api-key");
    }
  }, [provider, providerAuthMode]);

  const title = isTranscription
    ? t("setup.transcription.title")
    : mode === "summary"
      ? t("setup.summary.title")
      : mode === "chat"
        ? t("setup.chat.title")
        : t("setup.provider.title");
  const description = isTranscription
    ? t("setup.transcription.description")
    : t("setup.provider.description");

  async function run(action: () => Promise<unknown>, closeAfter = false) {
    setErrorMessage(undefined);
    setIsContinuing(true);
    try {
      await action();
      if (closeAfter) onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "setup_failed");
    } finally {
      setIsContinuing(false);
    }
  }

  async function saveApiKey(apiKey: string) {
    if (!apiKey.trim()) {
      setErrorMessage("provider_api_key_empty");
      return false;
    }

    setErrorMessage(undefined);
    setIsSaving(true);
    try {
      await onSaveProviderApiKey(provider, apiKey);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "provider_api_key_save_failed");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadWhisperModel(modelId: string) {
    const isFluidAudioModel =
      settings?.stt.models.find((model) => model.id === modelId)?.engine ===
      "fluidaudio";
    setErrorMessage(undefined);
    setDownloadingModelId(modelId);
    setDownloadProgressPercent(isFluidAudioModel ? 5 : 0);
    try {
      await onDownloadWhisperModel(modelId, {
        onProgress(progress) {
          setDownloadProgressPercent(
            Math.max(isFluidAudioModel ? 5 : 0, progress.progressPercent),
          );
        },
      });
      setDownloadProgressPercent(100);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "stt_model_download_failed");
    } finally {
      setDownloadingModelId(undefined);
    }
  }

  function requestWhisperModelDownload(modelId: string) {
    const compatibility = getSttModelCompatibility(settings?.compatibility, modelId);
    if (compatibility?.severity === "blocked") {
      setErrorMessage(compatibility.message);
      return;
    }

    if (compatibility?.severity === "warning") {
      setErrorMessage(undefined);
      setPendingCompatibilityWarning(compatibility);
      return;
    }

    void downloadWhisperModel(modelId);
  }

  function confirmCompatibilityWarning() {
    const modelId = pendingCompatibilityWarning?.id.replace("stt-model:", "");
    setPendingCompatibilityWarning(undefined);
    if (modelId) void downloadWhisperModel(modelId);
  }

  if (!open) return null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {isTranscription ? (
            <WhisperSetup
              settings={settings}
              selectedWhisperModelId={selectedWhisperModelId}
              onWhisperModelChange={onWhisperModelChange}
              downloadingModelId={downloadingModelId}
              downloadProgressPercent={downloadProgressPercent}
              onDownloadWhisperModel={requestWhisperModelDownload}
            />
          ) : (
            <ProviderSetup
              provider={provider}
              providerModel={providerModel}
              configured={providerConfigured}
              authMode={providerAuthMode}
              onAuthModeChange={setProviderAuthMode}
              onProviderChange={onProviderChange}
              onProviderModelChange={onProviderModelChange}
              onSaveApiKey={saveApiKey}
              isSaving={isSaving}
            />
          )}

          {errorMessage ? (
            <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("setup.cancel")}
            </Button>
            <Button
              type="button"
              disabled={
                !canContinue || isContinuing || Boolean(downloadingModelId)
              }
              onClick={() => void run(onContinue, true)}
            >
              {isTranscription ? (
                <Subtitles className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Bot className="h-4 w-4" aria-hidden="true" />
              )}
              {t("setup.continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(pendingCompatibilityWarning)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingCompatibilityWarning(undefined);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("setup.compatibility.warningTitle")}</DialogTitle>
            <DialogDescription>
              {pendingCompatibilityWarning?.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingCompatibilityWarning(undefined)}
            >
              {t("setup.cancel")}
            </Button>
            <Button type="button" onClick={confirmCompatibilityWarning}>
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {t("setup.compatibility.continueAnyway")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WhisperSetup({
  settings,
  selectedWhisperModelId,
  downloadingModelId,
  downloadProgressPercent,
  onWhisperModelChange,
  onDownloadWhisperModel,
}: {
  settings?: SettingsSnapshot;
  selectedWhisperModelId: string;
  downloadingModelId?: string;
  downloadProgressPercent: number;
  onWhisperModelChange(modelId: string): void;
  onDownloadWhisperModel(modelId: string): void;
}) {
  const { t } = useI18n();
  const recommendedModels = settings?.stt.models.filter((model) => model.recommended) ?? [];
  const advancedModels = settings?.stt.models.filter((model) => !model.recommended) ?? [];

  return (
    <div className="space-y-4">
      <ModelPicker
        title={t("setup.whisper.default")}
        models={recommendedModels}
        selectedModelId={selectedWhisperModelId}
        downloadingModelId={downloadingModelId}
        downloadProgressPercent={downloadProgressPercent}
        onModelChange={onWhisperModelChange}
        onDownload={onDownloadWhisperModel}
        compatibilityReport={settings?.compatibility}
      />
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {t("setup.whisper.advanced")}
        </summary>
        <ModelPicker
          title={t("setup.whisper.otherModels")}
          models={advancedModels}
          selectedModelId={selectedWhisperModelId}
          downloadingModelId={downloadingModelId}
          downloadProgressPercent={downloadProgressPercent}
          onModelChange={onWhisperModelChange}
          onDownload={onDownloadWhisperModel}
          compatibilityReport={settings?.compatibility}
        />
      </details>
    </div>
  );
}

function ModelPicker({
  title,
  models,
  selectedModelId,
  downloadingModelId,
  downloadProgressPercent,
  onModelChange,
  onDownload,
  compatibilityReport,
}: {
  title: string;
  models: SettingsSnapshot["stt"]["models"];
  selectedModelId: string;
  downloadingModelId?: string;
  downloadProgressPercent: number;
  onModelChange(modelId: string): void;
  onDownload(modelId: string): void;
  compatibilityReport?: SettingsSnapshot["compatibility"];
}) {
  const { t } = useI18n();

  if (models.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("setup.whisper.noModels")}</p>;
  }

  return (
    <div className="space-y-2 pt-2">
      <p className="text-sm font-medium">{title}</p>
      {models.map((model) => {
        const isDownloading = downloadingModelId === model.id;
        const compatibility = getSttModelCompatibility(
          compatibilityReport,
          model.id,
        );
        const blocked = compatibility?.severity === "blocked";
        const showProgressPercent = downloadProgressPercent > 0;
        const progressWidth = showProgressPercent
          ? `${Math.max(2, Math.min(downloadProgressPercent, 100))}%`
          : "100%";

        return (
          <label
            key={model.id}
            className={`block rounded-md border px-3 py-2 text-sm ${
              blocked ? "border-destructive/40 bg-destructive/5" : "border-border"
            }`}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <input
                  type="radio"
                  name="whisper-model"
                  checked={model.id === selectedModelId}
                  disabled={Boolean(downloadingModelId) || blocked}
                  onChange={() => onModelChange(model.id)}
                />
                <span className="min-w-0">
                  <span className="block font-medium">{model.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {model.fileName} · {formatModelSize(model.sizeMb)}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge>
                  {model.downloaded
                    ? t("setup.whisper.downloaded")
                    : isDownloading
                      ? t("setup.whisper.downloading")
                      : t("setup.whisper.notDownloaded")}
                </Badge>
                {!model.downloaded ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(downloadingModelId) || blocked}
                    onClick={(event) => {
                      event.preventDefault();
                      onDownload(model.id);
                    }}
                  >
                    {isDownloading
                      ? showProgressPercent
                        ? `${downloadProgressPercent}%`
                        : t("setup.whisper.downloading")
                      : t("setup.whisper.download")}
                  </Button>
                ) : null}
              </span>
            </span>
            {compatibility && compatibility.severity !== "supported" ? (
              <span
                className={`mt-2 block text-xs ${
                  blocked ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {compatibility.message}
              </span>
            ) : null}
            {isDownloading ? (
              <span className="mt-2 block">
                <span className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>{t("setup.whisper.downloadingModel")}</span>
                  {showProgressPercent ? (
                    <span>{downloadProgressPercent}%</span>
                  ) : null}
                </span>
                <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full bg-primary ${
                      showProgressPercent ? "" : "animate-pulse"
                    }`}
                    style={{ width: progressWidth }}
                  />
                </span>
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

function ProviderSetup({
  provider,
  providerModel,
  configured,
  authMode,
  isSaving,
  onAuthModeChange,
  onProviderChange,
  onProviderModelChange,
  onSaveApiKey,
}: {
  provider: ProviderKind;
  providerModel: string;
  configured: boolean;
  authMode: ProviderAuthMode;
  isSaving: boolean;
  onAuthModeChange(authMode: ProviderAuthMode): void;
  onProviderChange(provider: ProviderKind): void;
  onProviderModelChange(model: string): void;
  onSaveApiKey(apiKey: string): Promise<boolean> | boolean;
}) {
  const { t } = useI18n();
  const supportsSubscriptionAuth = provider === "openai";
  const effectiveAuthMode = supportsSubscriptionAuth ? authMode : "api-key";
  const modelOptions = useMemo(
    () => providerModelOptions[provider] ?? [providerModel],
    [provider, providerModel],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("setup.provider.provider")}</span>
          <select
            value={provider}
            onChange={(event) => onProviderChange(event.target.value as ProviderKind)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {providerOptions.map((option) => (
              <option key={option} value={option}>
                {providerLabels[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("setup.provider.model")}</span>
          <select
            value={providerModel}
            onChange={(event) => onProviderModelChange(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      </div>

      {supportsSubscriptionAuth ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("setup.provider.authMethod")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <AuthMethodOption
              title={t("setup.provider.chatgptSubscription")}
              description={t("setup.provider.chatgptSubscriptionDescription")}
              selected={effectiveAuthMode === "oauth-subscription"}
              onSelect={() => onAuthModeChange("oauth-subscription")}
            />
            <AuthMethodOption
              title={t("setup.provider.manualApiKey")}
              description={t("setup.provider.manualApiKeyDescription")}
              selected={effectiveAuthMode === "api-key"}
              onSelect={() => onAuthModeChange("api-key")}
            />
          </div>
        </div>
      ) : null}

      {effectiveAuthMode === "api-key" ? (
        <ApiKeyAuthPanel
          provider={provider}
          configured={configured}
          isSaving={isSaving}
          onSaveApiKey={onSaveApiKey}
        />
      ) : (
        <SubscriptionAuthPanel />
      )}
    </div>
  );
}

function AuthMethodOption({
  title,
  description,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      className={
        selected
          ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm"
          : "rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent"
      }
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="block font-medium">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">
        {description}
      </span>
    </button>
  );
}

function ApiKeyAuthPanel({
  provider,
  configured,
  isSaving,
  onSaveApiKey,
}: {
  provider: ProviderKind;
  configured: boolean;
  isSaving: boolean;
  onSaveApiKey(apiKey: string): Promise<boolean> | boolean;
}) {
  const { t } = useI18n();
  const [apiKey, setApiKey] = useState("");

  async function saveApiKey() {
    const saved = await onSaveApiKey(apiKey);
    if (saved) setApiKey("");
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{t("setup.provider.apiKey")}</span>
        <Badge>
          {configured ? t("status.configured") : t("status.notConfigured")}
        </Badge>
      </div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="provider-api-key">
          {t("setup.provider.apiKey")}
        </label>
        <Input
          id="provider-api-key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          type="password"
          autoComplete="off"
          placeholder={t("setup.provider.apiKeyPlaceholder", {
            provider: providerLabels[provider],
          })}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          disabled={isSaving || !apiKey.trim()}
          onClick={() => void saveApiKey()}
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {t("setup.provider.save")}
        </Button>
      </div>
    </div>
  );
}

function SubscriptionAuthPanel() {
  const { t } = useI18n();

  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {t("setup.provider.chatgptSubscription")}
        </span>
        <Badge>{t("setup.provider.oauthStatus")}</Badge>
      </div>
      <p className="text-muted-foreground">
        {t("setup.provider.oauthDescription")}
      </p>
      <Button type="button" variant="outline" className="mt-3" disabled>
        {t("setup.provider.connectSubscription")}
      </Button>
    </div>
  );
}
