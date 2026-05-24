import { Bot, Download, FileText } from "lucide-react";
import { ShortcutKbd } from "@/components/keyboard/ShortcutKbd";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import {
  faqShortcutDefinitions,
  resolveShortcutKeys,
} from "@/app/navigationShortcuts";
import { useI18n, type TranslationKey } from "@/i18n";

const workflowSections = [
  {
    title: "faq.workflow.download.title",
    description: "faq.workflow.download.description",
    icon: Download,
  },
  {
    title: "faq.workflow.transcription.title",
    description: "faq.workflow.transcription.description",
    icon: FileText,
  },
  {
    title: "faq.workflow.chat.title",
    description: "faq.workflow.chat.description",
    icon: Bot,
  },
] satisfies Array<{
  title: TranslationKey;
  description: TranslationKey;
  icon: typeof Download;
}>;

export function FaqView() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{t("faq.title")}</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {t("faq.description")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("faq.shortcuts.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">
                    {t("faq.shortcuts.action")}
                  </th>
                  <th className="py-2 font-medium">{t("faq.shortcuts.keys")}</th>
                </tr>
              </thead>
              <tbody>
                {faqShortcutDefinitions.map((shortcut) => (
                  <tr key={shortcut.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4">
                      {t(
                        "faqLabelKey" in shortcut
                          ? shortcut.faqLabelKey
                          : shortcut.labelKey,
                      )}
                    </td>
                    <td className="py-3">
                      <ShortcutKbd keys={resolveShortcutKeys(shortcut.keys)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {workflowSections.map((section) => {
          const Icon = section.icon;

          return (
            <Card key={section.title}>
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <CardTitle className="text-base">{t(section.title)}</CardTitle>
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
    </div>
  );
}
