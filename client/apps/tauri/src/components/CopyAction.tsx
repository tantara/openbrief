import { Check, Copy } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentPropsWithoutRef,
} from "react";
import { Button, type ButtonProps } from "@acme/ui/button";
import { DropdownMenuItem } from "@acme/ui/dropdown-menu";
import { cn } from "@acme/ui";
import { copyTextToClipboard } from "@/services/clipboardService";

const copiedResetDelayMs = 1200;
const copiedMenuCloseDelayMs = 700;

type CopyFeedbackOptions = {
  value: string;
  onCopied?(): void;
  onCopiedDelayMs?: number;
};

function useCopyFeedback({
  value,
  onCopied,
  onCopiedDelayMs = 0,
}: CopyFeedbackOptions) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);
  const onCopiedTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
      if (onCopiedTimeoutRef.current !== undefined) {
        window.clearTimeout(onCopiedTimeoutRef.current);
      }
    };
  }, []);

  async function copy() {
    await copyTextToClipboard(value);
    setCopied(true);

    if (onCopiedTimeoutRef.current !== undefined) {
      window.clearTimeout(onCopiedTimeoutRef.current);
    }
    if (onCopied) {
      if (onCopiedDelayMs > 0) {
        onCopiedTimeoutRef.current = window.setTimeout(() => {
          onCopied();
          onCopiedTimeoutRef.current = undefined;
        }, onCopiedDelayMs);
      } else {
        onCopied();
      }
    }

    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      timeoutRef.current = undefined;
    }, copiedResetDelayMs);
  }

  return { copied, copy };
}

function CopyStateIcon({ copied }: { copied: boolean }) {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <Copy
        className={cn(
          "absolute h-3.5 w-3.5 transition-all duration-200 ease-out",
          copied ? "scale-50 rotate-45 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
        aria-hidden="true"
      />
      <Check
        className={cn(
          "absolute h-3.5 w-3.5 text-emerald-600 transition-all duration-200 ease-out",
          copied ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-45 opacity-0",
        )}
        aria-hidden="true"
      />
    </span>
  );
}

type CopyActionButtonProps = Omit<ButtonProps, "onClick"> & {
  value: string;
  ariaLabel: string;
  children?: ReactNode;
  onCopied?(): void;
};

export function CopyActionButton({
  value,
  ariaLabel,
  children,
  className,
  onCopied,
  ...buttonProps
}: CopyActionButtonProps) {
  const { copied, copy } = useCopyFeedback({ value, onCopied });

  return (
    <Button
      type="button"
      aria-label={ariaLabel}
      data-copied={copied}
      className={className}
      onClick={() => void copy()}
      {...buttonProps}
    >
      <CopyStateIcon copied={copied} />
      {children}
    </Button>
  );
}

type CopyDropdownMenuItemProps = Omit<
  ComponentPropsWithoutRef<typeof DropdownMenuItem>,
  "onSelect"
> & {
  value: string;
  children: ReactNode;
  onCopied?(): void;
};

export function CopyDropdownMenuItem({
  value,
  children,
  className,
  onCopied,
  ...itemProps
}: CopyDropdownMenuItemProps) {
  const { copied, copy } = useCopyFeedback({
    value,
    onCopied,
    onCopiedDelayMs: copiedMenuCloseDelayMs,
  });

  return (
    <DropdownMenuItem
      data-copied={copied}
      className={className}
      onSelect={(event) => {
        event.preventDefault();
        void copy();
      }}
      {...itemProps}
    >
      <CopyStateIcon copied={copied} />
      {children}
    </DropdownMenuItem>
  );
}
