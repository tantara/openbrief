import type {
  EditorAgentMessage,
  EditorAgentPlan,
  EditorAgentPlanKind,
} from "@/domain/editor-agent";
import type { TranslationKey } from "@/i18n";
import { useI18n } from "@/i18n";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import { Textarea } from "@acme/ui/textarea";
import { Bot, Loader2, Scissors, Send } from "lucide-react";

export type EditorAgentPanelProps = {
  messages: EditorAgentMessage[];
  input: string;
  disabled?: boolean;
  isDrafting?: boolean;
  activePlan?: EditorAgentPlan;
  onInputChange(value: string): void;
  onSubmit(kind: EditorAgentPlanKind, instruction?: string): void;
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
  onInputChange,
  onSubmit,
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
