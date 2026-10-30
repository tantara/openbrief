import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { setOpenaiCompatibleModel } from "@/domain/provider";
import { useI18n } from "@/i18n";
import { listOpenaiCompatibleModels } from "@/services/openaiCompatibleModelsService";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";

/**
 * Free-text model field for the OpenAI-compatible provider. Edits stay local
 * until blur/Enter/unmount so partially typed or empty values never reach the
 * persisted preferences, and the server's `/v1/models` catalog is offered as
 * suggestions.
 */
export function OpenaiCompatibleModelInput({
  id,
  value,
  ariaLabel,
  className,
  onCommit,
}: {
  id?: string;
  value: string;
  ariaLabel?: string;
  className?: string;
  onCommit(model: string): void;
}) {
  const { t } = useI18n();
  const datalistId = useId();
  const [draft, setDraft] = useState(value);
  const [models, setModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  draftRef.current = draft;
  valueRef.current = value;
  onCommitRef.current = onCommit;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = useCallback(() => {
    const model = draftRef.current.trim();
    if (!model) {
      setDraft(valueRef.current);
      return;
    }
    if (model === valueRef.current) return;

    setOpenaiCompatibleModel(model);
    onCommitRef.current(model);
  }, []);

  const refreshModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      setModels(await listOpenaiCompatibleModels());
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  // Dialogs closed via Escape unmount the field without a blur event.
  useEffect(() => commit, [commit]);

  return (
    <div className={cn("flex min-w-0 gap-2", className)}>
      <Input
        id={id}
        aria-label={ariaLabel}
        value={draft}
        list={datalistId}
        autoComplete="off"
        spellCheck={false}
        placeholder={t("setup.provider.model")}
        className="h-10 min-w-0 flex-1"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
        }}
      />
      <datalist id={datalistId}>
        {models.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10 shrink-0"
        disabled={isLoadingModels}
        aria-label={t("setup.provider.refreshModels")}
        title={t("setup.provider.refreshModels")}
        onClick={() => void refreshModels()}
      >
        {isLoadingModels ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}
