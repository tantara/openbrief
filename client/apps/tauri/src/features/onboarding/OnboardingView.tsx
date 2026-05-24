import {
  Bot,
  Download,
  FileText,
  KeyRound,
  MessageSquareText,
  Palette,
  Video,
} from "lucide-react";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import { useI18n, type TranslationKey } from "@/i18n";
import {
  appColorSeedOptions,
  type AppColorSeed,
} from "@/services/themeSettingsService";

type OnboardingViewProps = {
  appColorSeed?: AppColorSeed;
  onColorSeedChange?(colorSeed: AppColorSeed): void;
  onFinish(): void;
};

const onboardingSteps = [
  {
    title: "onboarding.step.appearance.title",
    description: "onboarding.step.appearance.description",
    badge: "onboarding.step.appearance.badge",
    icon: Palette,
  },
  {
    title: "onboarding.step.add.title",
    description: "onboarding.step.add.description",
    badge: "onboarding.step.add.badge",
    icon: Video,
  },
  {
    title: "onboarding.step.transcribe.title",
    description: "onboarding.step.transcribe.description",
    badge: "onboarding.step.transcribe.badge",
    icon: FileText,
  },
  {
    title: "onboarding.step.provider.title",
    description: "onboarding.step.provider.description",
    badge: "onboarding.step.provider.badge",
    icon: KeyRound,
  },
  {
    title: "onboarding.step.create.title",
    description: "onboarding.step.create.description",
    badge: "onboarding.step.create.badge",
    icon: MessageSquareText,
  },
] satisfies Array<{
  title: TranslationKey;
  description: TranslationKey;
  badge: TranslationKey;
  icon: typeof Video;
}>;

export function OnboardingView({
  appColorSeed = "green",
  onColorSeedChange,
  onFinish,
}: OnboardingViewProps) {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <Badge className="w-fit">
            {t("onboarding.badge")}
          </Badge>
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-normal">
              {t("onboarding.title")}
            </h2>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              {t("onboarding.description")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={onFinish}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("onboarding.start")}
            </Button>
            <Button type="button" variant="ghost" onClick={onFinish}>
              {t("onboarding.skip")}
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            <div>
              <p className="text-sm font-medium">
                {t("onboarding.appearance.title")}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t("onboarding.appearance.description")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {appColorSeedOptions.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={appColorSeed === option.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => onColorSeedChange?.(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              {t("onboarding.workflow.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {onboardingSteps.map((step) => {
              const Icon = step.icon;

              return (
                <div
                  key={step.title}
                  className="rounded-md border border-border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <Badge>{t(step.badge)}</Badge>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">{t(step.title)}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t(step.description)}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
