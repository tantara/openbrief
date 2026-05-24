import { Bot, Download, FileText, MessageSquareText } from "lucide-react";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import { useI18n, type TranslationKey } from "@/i18n";

const tutorialSections = [
  {
    title: "tutorial.download.title",
    description: "tutorial.download.description",
    icon: Download,
  },
  {
    title: "tutorial.transcription.title",
    description: "tutorial.transcription.description",
    icon: FileText,
  },
  {
    title: "tutorial.summary.title",
    description: "tutorial.summary.description",
    icon: Bot,
  },
  {
    title: "tutorial.chat.title",
    description: "tutorial.chat.description",
    icon: MessageSquareText,
  },
] satisfies Array<{
  title: TranslationKey;
  description: TranslationKey;
  icon: typeof Download;
}>;

type TutorialViewProps = {
  onOpenOnboarding?: () => void;
};

export function TutorialView({ onOpenOnboarding }: TutorialViewProps) {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {tutorialSections.map((section) => {
          const Icon = section.icon;

          return (
            <Card key={section.title}>
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <CardTitle>{t(section.title)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">
                  {t(section.description)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {onOpenOnboarding ? (
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {t("tutorial.onboarding.description")}
          </p>
          <Button type="button" variant="outline" onClick={onOpenOnboarding}>
            {t("tutorial.onboarding.action")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
