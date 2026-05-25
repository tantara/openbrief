import type {
  EditorAgentMessage,
  EditorAgentPlan,
  EditorAgentPlanKind,
} from "@/domain/editor-agent";
import type { ProviderKind } from "@/domain/media-library";
import type { TranslationKey } from "@/i18n";
import type { ReactNode } from "react";
import type { AiWorkflowProviderConfig } from "@/services/aiProviderPreferencesService";
import { ProviderIcon } from "@/components/provider/ProviderIcon";
import {
  defaultProviderModels,
  providerLabels,
  providerModelOptions,
  providerOptions,
} from "@/domain/provider";
import { useI18n } from "@/i18n";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@acme/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@acme/ui/select";
import { Textarea } from "@acme/ui/textarea";
import { Bot, Loader2, Scissors, Send } from "lucide-react";

export type EditorAgentPanelProps = {
  messages: EditorAgentMessage[];
  input: string;
  disabled?: boolean;
  isDrafting?: boolean;
  activePlan?: EditorAgentPlan;
  providerConfig: AiWorkflowProviderConfig;
  onInputChange(value: string): void;
  onSubmit(kind: EditorAgentPlanKind, instruction?: string): void;
  onProviderConfigChange(config: AiWorkflowProviderConfig): void;
};

const quickPrompts: Array<{
  key: TranslationKey;
  kind: EditorAgentPlanKind;
  instruction: string;
}> = [
  {
    key: "editor.agent.quick.short",
    kind: "composition",
    instruction: "Create a 30 second summary-to-video short with a hook.",
  },
  {
    key: "editor.agent.quick.captions",
    kind: "composition",
    instruction: "Add high-energy TikTok-style wipe captions.",
  },
  {
    key: "editor.agent.quick.cuts",
    kind: "transcript-edit",
    instruction: "Draft conservative transcript cuts for filler and low-signal lines.",
  },
];

export function EditorAgentPanel({
  messages,
  input,
  disabled,
  isDrafting,
  activePlan,
  providerConfig,
  onInputChange,
  onSubmit,
  onProviderConfigChange,
}: EditorAgentPanelProps) {
  const { t } = useI18n();

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4" aria-hidden="true" />
          {t("editor.agent.title")}
        </CardTitle>
        <p className="text-muted-foreground text-sm">{t("editor.agent.subtitle")}</p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <EditorAgentProviderDialog
          config={providerConfig}
          onChange={onProviderConfigChange}
        />
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <Button
              key={prompt.key}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || isDrafting}
              onClick={() => onSubmit(prompt.kind, prompt.instruction)}
            >
              {t(prompt.key)}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-3">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {disabled ? t("editor.agent.noSource") : t("editor.agent.empty")}
            </p>
          ) : (
            <ol className="space-y-3">
              {messages.map((message) => (
                <li key={message.id} className="space-y-2">
                  <div className="text-muted-foreground text-xs">
                    {message.role === "assistant"
                      ? t("editor.agent.assistant")
                      : t("editor.agent.user")}
                  </div>
                  <div className="bg-muted/60 rounded-md px-3 py-2 text-sm">
                    {message.content}
                  </div>
                  {message.plan ? (
                    <EditorAgentPlanCard
                      plan={message.plan}
                      active={activePlan === message.plan}
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="editor-agent-input">
            {t("editor.agent.input")}
          </label>
          <Textarea
            id="editor-agent-input"
            value={input}
            placeholder={t("editor.agent.input.placeholder")}
            className="min-h-24 resize-none"
            disabled={disabled || isDrafting}
            onChange={(event) => onInputChange(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              disabled={disabled || isDrafting}
              onClick={() => onSubmit("composition")}
            >
              {isDrafting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {t("editor.agent.draftVideo")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || isDrafting}
              onClick={() => onSubmit("transcript-edit")}
            >
              <Scissors className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("editor.agent.draftCuts")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditorAgentPlanCard({
  plan,
  active,
}: {
  plan: EditorAgentPlan;
  active: boolean;
}) {
  const { t } = useI18n();

  return (
    <div
      className="border-border space-y-2 rounded-md border bg-background px-3 py-2 text-sm"
      data-active={active}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{plan.scenario}</Badge>
        {plan.componentNames.map((componentName) => (
          <Badge key={componentName} variant="outline">
            {componentName}
          </Badge>
        ))}
      </div>
      {plan.storyboard.length > 0 ? (
        <ol className="text-muted-foreground list-decimal space-y-1 pl-4 text-xs">
          {plan.storyboard.slice(0, 3).map((scene) => (
            <li key={`${scene.startSeconds}-${scene.title}`}>
              <span className="text-foreground">{scene.title}</span>:{" "}
              {scene.narration}
            </li>
          ))}
        </ol>
      ) : null}
      {plan.transcriptEdit?.cuts.length ? (
        <div className="text-muted-foreground text-xs">
          {t("editor.agent.cuts", { count: plan.transcriptEdit.cuts.length })}
        </div>
      ) : null}
      {plan.validation.warnings.length ? (
        <div className="text-muted-foreground text-xs">
          {t("editor.agent.validation")}: {plan.validation.warnings[0]}
        </div>
      ) : null}
    </div>
  );
}

function EditorAgentProviderDialog({
  config,
  onChange,
}: {
  config: AiWorkflowProviderConfig;
  onChange(config: AiWorkflowProviderConfig): void;
}) {
  const { t } = useI18n();
  const label = `${t("editor.agent.provider")} / ${t("setup.provider.model")}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-fit max-w-full justify-start gap-2 px-3 text-left"
          aria-label={label}
        >
          <ProviderIcon provider={config.provider} size={16} decorative />
          <span className="text-muted-foreground min-w-0 truncate text-xs">
            {providerLabels[config.provider]} ·{" "}
            {shortProviderModelName(config.model)}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {t("editor.agent.providerDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2 text-sm">
            <span className="font-medium">{t("setup.provider.provider")}</span>
            <ProviderSelect
              value={config.provider}
              onChange={(provider) =>
                onChange({
                  provider,
                  model: defaultProviderModels[provider],
                  streamingMode: config.streamingMode,
                })
              }
            />
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-medium">{t("setup.provider.model")}</span>
            <ProviderModelSelect
              provider={config.provider}
              value={config.model}
              onChange={(model) => onChange({ ...config, model })}
            />
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-medium">{t("workbench.chat.streaming")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={config.streamingMode}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors ${
                config.streamingMode
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
              onClick={() =>
                onChange({
                  ...config,
                  streamingMode: !config.streamingMode,
                })
              }
            >
              <span>{t("workbench.chat.streamingMode")}</span>
              <span className="text-xs">
                {config.streamingMode
                  ? t("workbench.chat.streamingOn")
                  : t("workbench.chat.streamingOff")}
              </span>
            </button>
            <p className="text-muted-foreground text-xs">
              {t("editor.agent.streamingDescription")}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProviderSelect({
  value,
  onChange,
}: {
  value: ProviderKind;
  onChange(value: ProviderKind): void;
}) {
  const { t } = useI18n();

  return (
    <Select value={value} onValueChange={(value) => onChange(value as ProviderKind)}>
      <SelectTrigger aria-label={t("setup.provider.provider")} className="w-full">
        <SelectTriggerContent
          icon={<ProviderIcon provider={value} size={18} decorative />}
          label={providerLabels[value]}
        />
      </SelectTrigger>
      <SelectContent>
        {providerOptions.map((provider) => (
          <SelectItem
            key={provider}
            value={provider}
            textValue={providerLabels[provider]}
          >
            <SelectTriggerContent
              icon={<ProviderIcon provider={provider} size={18} decorative />}
              label={providerLabels[provider]}
            />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProviderModelSelect({
  provider,
  value,
  onChange,
}: {
  provider: ProviderKind;
  value: string;
  onChange(value: string): void;
}) {
  const { t } = useI18n();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={t("setup.provider.model")} className="w-full">
        <SelectTriggerContent label={value} />
      </SelectTrigger>
      <SelectContent>
        {providerModelOptions[provider].map((model) => (
          <SelectItem key={model} value={model}>
            {model}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SelectTriggerContent({
  icon,
  label,
}: {
  icon?: ReactNode;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function shortProviderModelName(model: string) {
  const chunks = model.split(/[/:]/).filter(Boolean);
  return chunks[chunks.length - 1] ?? model;
}
