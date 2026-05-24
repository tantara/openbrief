import { Kbd, KbdGroup } from "@acme/ui/kbd";

export function ShortcutKbd({
  keys,
  separatorClassName = "text-xs text-muted-foreground",
}: {
  keys: string[];
  separatorClassName?: string;
}) {
  return (
    <KbdGroup aria-label={keys.join(" + ")}>
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? (
            <span className={separatorClassName} aria-hidden="true">
              +
            </span>
          ) : null}
          <Kbd>{key}</Kbd>
        </span>
      ))}
    </KbdGroup>
  );
}
