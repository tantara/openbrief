import { LayoutGrid, ListVideo, Notebook, Settings } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "@acme/ui/button";
import { OpenBriefMark } from "@acme/ui/openbrief-mark";
import { ShortcutKbd } from "@/components/keyboard/ShortcutKbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@acme/ui/tooltip";
import {
  isAddVideoShortcutKey,
  isSearchShortcutKey,
  pageShortcutDefinitions,
  resolveShortcutKeys,
  viewForShortcutKey,
} from "@/app/navigationShortcuts";
import type { LibraryView } from "@/hooks/useMediaLibrary";
import { useI18n } from "@/i18n";
import { cn } from "@acme/ui";

type AppLayoutProps = {
  activeView: LibraryView;
  pageTitle: string;
  headerContent?: ReactNode;
  children: ReactNode;
  onActiveViewChange(view: LibraryView): void;
  onSearchShortcut?(): void;
  onAddVideoShortcut?(): void;
};

export function AppLayout({
  activeView,
  pageTitle,
  headerContent,
  children,
  onActiveViewChange,
  onSearchShortcut,
  onAddVideoShortcut,
}: AppLayoutProps) {
  const { t } = useI18n();
  const shortcuts = pageShortcutDefinitions.map((definition) => ({
    ...definition,
    label: t(definition.labelKey),
    keys: resolveShortcutKeys(definition.keys),
    icon: iconForShortcut(definition.id),
  }));

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      if (event.altKey || event.shiftKey) return;
      if (!event.metaKey && !event.ctrlKey) return;

      if (isSearchShortcutKey(event.key) && onSearchShortcut) {
        event.preventDefault();
        onSearchShortcut();
        return;
      }

      if (isAddVideoShortcutKey(event.key) && onAddVideoShortcut) {
        event.preventDefault();
        onAddVideoShortcut();
        return;
      }

      const view = viewForShortcutKey(event.key);
      if (!view) return;

      event.preventDefault();
      onActiveViewChange(view);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onActiveViewChange, onAddVideoShortcut, onSearchShortcut]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-50 flex w-20 flex-col items-center border-r border-border bg-card px-3 py-5">
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <OpenBriefMark className="h-5 w-5" />
        </div>
        <TooltipProvider delayDuration={0}>
          <nav className="flex flex-col gap-2" aria-label="Primary">
            {shortcuts.slice(0, 3).map((item) => (
              <SidebarNavItem
                key={item.view}
                active={activeView === item.view}
                label={item.label}
                shortcutKeys={item.keys}
                onClick={() => onActiveViewChange(item.view)}
              >
                {item.icon}
              </SidebarNavItem>
            ))}
          </nav>
          <SidebarNavItem
            active={activeView === "settings"}
            label={shortcuts[3].label}
            shortcutKeys={shortcuts[3].keys}
            className="mt-auto"
            onClick={() => onActiveViewChange("settings")}
          >
            {shortcuts[3].icon}
          </SidebarNavItem>
        </TooltipProvider>
      </aside>

      <div className="min-h-screen pl-20">
        <header className="fixed left-20 right-0 top-0 z-40 flex h-16 items-center justify-between gap-6 border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <h1
            className={cn(
              "min-w-0 truncate text-lg font-semibold",
              activeView === "workbench" ? "flex-1" : "shrink-0",
            )}
          >
            {pageTitle}
          </h1>
          {headerContent ? (
            <div
              className={cn(
                "flex min-w-0",
                activeView === "workbench" ? "shrink-0" : "flex-1",
              )}
            >
              {headerContent}
            </div>
          ) : null}
        </header>
        <main className="h-screen overflow-y-auto pt-16">
          <section className="min-h-full p-6">{children}</section>
        </main>
      </div>
    </div>
  );
}

function SidebarNavItem({
  active,
  label,
  shortcutKeys,
  className,
  children,
  onClick,
}: {
  active: boolean;
  label: string;
  shortcutKeys: string[];
  className?: string;
  children: ReactNode;
  onClick(): void;
}) {
  const shortcutLabel = shortcutKeys.join(" + ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "default" : "ghost"}
          size="icon"
          className={className}
          aria-label={`${label} (${shortcutLabel})`}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        sideOffset={8}
        className="w-max max-w-xs whitespace-nowrap px-3 py-2"
      >
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{label}</span>
          <ShortcutKbd
            keys={shortcutKeys}
            separatorClassName="text-xs text-primary-foreground/70"
          />
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function iconForShortcut(id: string) {
  switch (id) {
    case "library":
      return <LayoutGrid className="h-4 w-4" aria-hidden="true" />;
    case "note":
      return <Notebook className="h-4 w-4" aria-hidden="true" />;
    case "playlists":
      return <ListVideo className="h-4 w-4" aria-hidden="true" />;
    case "settings":
      return <Settings className="h-4 w-4" aria-hidden="true" />;
    default:
      return null;
  }
}
