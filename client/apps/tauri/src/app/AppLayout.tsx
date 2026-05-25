import type { LibraryView } from "@/hooks/useMediaLibrary";
import type { WorkspaceSnapshot } from "@/services/workspaceService";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isAddVideoShortcutKey,
  isSearchShortcutKey,
  pageShortcutDefinitions,
  resolveShortcutKeys,
  viewForShortcutKey,
} from "@/app/navigationShortcuts";
import { ShortcutKbd } from "@/components/keyboard/ShortcutKbd";
import { useI18n } from "@/i18n";
import {
  createWorkspaceService,
  reloadForWorkspaceChange,
} from "@/services/workspaceService";
import { readActiveWorkspaceId } from "@/services/workspaceStorage";
import {
  Check,
  Clapperboard,
  FolderPlus,
  LayoutGrid,
  ListVideo,
  Notebook,
  Settings,
  Volume2,
} from "lucide-react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@acme/ui/context-menu";
import { OpenBriefMark } from "@acme/ui/openbrief-mark";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@acme/ui/tooltip";

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
  const primaryShortcuts = shortcuts.filter((item) => item.view !== "settings");
  const settingsShortcut = shortcuts.find((item) => item.view === "settings");
  const workspaceService = useMemo(() => createWorkspaceService(), []);
  const [workspaceSnapshot, setWorkspaceSnapshot] =
    useState<WorkspaceSnapshot>();

  useEffect(() => {
    let cancelled = false;
    const initialWorkspaceId = readActiveWorkspaceId();

    workspaceService
      .loadSnapshot()
      .then((snapshot) => {
        if (!cancelled) {
          if (
            snapshot.activeWorkspaceId !== initialWorkspaceId &&
            readActiveWorkspaceId() === snapshot.activeWorkspaceId
          ) {
            reloadForWorkspaceChange();
            return;
          }

          setWorkspaceSnapshot(snapshot);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaceSnapshot(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceService]);

  const createNewWorkspace = useCallback(() => {
    void workspaceService
      .createWorkspace()
      .then(() => reloadForWorkspaceChange());
  }, [workspaceService]);

  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      if (workspaceId === workspaceSnapshot?.activeWorkspaceId) {
        return;
      }

      void workspaceService
        .switchWorkspace(workspaceId)
        .then(() => reloadForWorkspaceChange());
    },
    [workspaceService, workspaceSnapshot?.activeWorkspaceId],
  );

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
    <div className="bg-background text-foreground h-screen overflow-hidden overscroll-none">
      <aside className="border-border bg-card fixed inset-y-0 left-0 z-50 flex w-20 flex-col items-center border-r px-3 py-5">
        <ContextMenu>
          {/* Workspace switching is intentionally hidden behind the logo while experimental. */}
          <ContextMenuTrigger asChild>
            <button
              type="button"
              className="bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-background mb-6 flex h-11 w-11 items-center justify-center rounded-lg transition outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              aria-label={t("workspace.menu")}
            >
              <OpenBriefMark className="h-5 w-5" />
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <ContextMenuLabel>{t("workspace.menu")}</ContextMenuLabel>
            <ContextMenuSeparator />
            {workspaceSnapshot?.workspaces.map((workspace) => (
              <ContextMenuItem
                key={workspace.id}
                onSelect={() => switchWorkspace(workspace.id)}
                disabled={workspace.active}
              >
                <Check
                  className={cn("h-4 w-4", !workspace.active && "opacity-0")}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  {workspace.name}
                </span>
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={createNewWorkspace}>
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              {t("workspace.create")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <TooltipProvider delayDuration={0}>
          <nav className="flex flex-col gap-2" aria-label="Primary">
            {primaryShortcuts.map((item) => (
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
          {settingsShortcut ? (
            <SidebarNavItem
              active={activeView === "settings"}
              label={settingsShortcut.label}
              shortcutKeys={settingsShortcut.keys}
              className="mt-auto"
              onClick={() => onActiveViewChange("settings")}
            >
              {settingsShortcut.icon}
            </SidebarNavItem>
          ) : null}
        </TooltipProvider>
      </aside>

      <div className="h-full pl-20">
        <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed top-0 right-0 left-20 z-40 flex h-16 items-center justify-between gap-6 border-b px-6 backdrop-blur">
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
        <main className="h-full overflow-y-auto overscroll-contain pt-16">
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
        className="w-max max-w-xs px-3 py-2 whitespace-nowrap"
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
    case "voices":
      return <Volume2 className="h-4 w-4" aria-hidden="true" />;
    case "editor":
      return <Clapperboard className="h-4 w-4" aria-hidden="true" />;
    case "settings":
      return <Settings className="h-4 w-4" aria-hidden="true" />;
    default:
      return null;
  }
}
