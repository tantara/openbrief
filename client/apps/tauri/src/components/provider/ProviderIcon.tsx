import ClaudeColor from "@lobehub/icons/es/Claude/components/Color.js";
import DeepSeekColor from "@lobehub/icons/es/DeepSeek/components/Color.js";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color.js";
import OpenAiMono from "@lobehub/icons/es/OpenAI/components/Mono.js";
import OpenRouterMono from "@lobehub/icons/es/OpenRouter/components/Mono.js";
import type { ProviderKind } from "@/domain/media-library";
import { providerLabels } from "@/domain/provider";
import { cn } from "@acme/ui";

type ProviderIconProps = {
  provider: ProviderKind;
  size?: number;
  className?: string;
  decorative?: boolean;
};

export function ProviderIcon({
  provider,
  size = 20,
  className,
  decorative = false,
}: ProviderIconProps) {
  const ariaLabel = providerLabels[provider];
  const accessibilityProps = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ "aria-label": ariaLabel } as const);
  const iconClassName = cn("shrink-0", className);

  switch (provider) {
    case "openai":
      return (
        <OpenAiMono
          {...accessibilityProps}
          className={iconClassName}
          size={size}
        />
      );
    case "anthropic":
      return (
        <ClaudeColor
          {...accessibilityProps}
          className={iconClassName}
          size={size}
        />
      );
    case "gemini":
      return (
        <GeminiColor
          {...accessibilityProps}
          className={iconClassName}
          size={size}
        />
      );
    case "openrouter":
      return (
        <OpenRouterMono
          {...accessibilityProps}
          className={iconClassName}
          size={size}
          style={{ color: "#6566F1" }}
        />
      );
    case "deepseek":
      return (
        <DeepSeekColor
          {...accessibilityProps}
          className={iconClassName}
          size={size}
        />
      );
  }
}
