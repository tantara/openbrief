import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppLayout } from "@/app/AppLayout";

describe("AppLayout", () => {
  it("switches pages with modifier number shortcuts", () => {
    const onActiveViewChange = vi.fn();
    render(
      <AppLayout
        activeView="finder"
        pageTitle="Library"
        onActiveViewChange={onActiveViewChange}
      >
        <div>Current page</div>
      </AppLayout>,
    );

    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    fireEvent.keyDown(window, { key: "3", ctrlKey: true });
    fireEvent.keyDown(window, { key: "0", metaKey: true });
    fireEvent.keyDown(window, { key: "1", ctrlKey: true });

    expect(onActiveViewChange).toHaveBeenNthCalledWith(1, "workbench");
    expect(onActiveViewChange).toHaveBeenNthCalledWith(2, "playlists");
    expect(onActiveViewChange).toHaveBeenNthCalledWith(3, "settings");
    expect(onActiveViewChange).toHaveBeenNthCalledWith(4, "finder");
  });

  it("runs the search shortcut with modifier l", () => {
    const onSearchShortcut = vi.fn();
    render(
      <AppLayout
        activeView="finder"
        pageTitle="Library"
        onActiveViewChange={() => {}}
        onSearchShortcut={onSearchShortcut}
      >
        <div>Current page</div>
      </AppLayout>,
    );

    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    fireEvent.keyDown(window, { key: "L", metaKey: true });

    expect(onSearchShortcut).toHaveBeenCalledTimes(2);
  });

  it("runs the add video shortcut with modifier k", () => {
    const onAddVideoShortcut = vi.fn();
    render(
      <AppLayout
        activeView="settings"
        pageTitle="Settings"
        onActiveViewChange={() => {}}
        onAddVideoShortcut={onAddVideoShortcut}
      >
        <div>Current page</div>
      </AppLayout>,
    );

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.keyDown(window, { key: "K", metaKey: true });

    expect(onAddVideoShortcut).toHaveBeenCalledTimes(2);
  });

  it("keeps note header actions visible by letting long titles shrink", () => {
    render(
      <AppLayout
        activeView="workbench"
        pageTitle="A very long video title that should truncate before the action buttons"
        headerContent={<button type="button">Open</button>}
        onActiveViewChange={() => {}}
      >
        <div>Current page</div>
      </AppLayout>,
    );

    expect(screen.getByRole("heading")).toHaveClass("flex-1", "truncate");
    expect(screen.getByRole("button", { name: "Open" }).parentElement)
      .toHaveClass("shrink-0");
  });

  it("shows shortcut tooltips when hovering sidebar menu items", async () => {
    render(
      <AppLayout
        activeView="finder"
        pageTitle="Library"
        onActiveViewChange={() => {}}
      >
        <div>Current page</div>
      </AppLayout>,
    );

    expect(screen.queryByRole("button", { name: "Shortcuts" })).not.toBeInTheDocument();

    fireEvent.focus(screen.getByRole("button", { name: /library.*(?:⌘|ctrl) \+ 1/i }));
    expect(
      (await screen.findAllByLabelText(/(?:⌘|Ctrl) \+ 1/)).some(
        (element) => element.getAttribute("data-slot") === "kbd-group",
      ),
    ).toBe(true);

    fireEvent.blur(screen.getByRole("button", { name: /library.*(?:⌘|ctrl) \+ 1/i }));
    fireEvent.focus(screen.getByRole("button", { name: /note.*(?:⌘|ctrl) \+ 2/i }));
    expect(
      (await screen.findAllByLabelText(/(?:⌘|Ctrl) \+ 2/)).some(
        (element) => element.getAttribute("data-slot") === "kbd-group",
      ),
    ).toBe(true);

    fireEvent.blur(screen.getByRole("button", { name: /note.*(?:⌘|ctrl) \+ 2/i }));
    fireEvent.focus(screen.getByRole("button", { name: /playlists.*(?:⌘|ctrl) \+ 3/i }));
    expect(
      (await screen.findAllByLabelText(/(?:⌘|Ctrl) \+ 3/)).some(
        (element) => element.getAttribute("data-slot") === "kbd-group",
      ),
    ).toBe(true);

    fireEvent.blur(screen.getByRole("button", { name: /playlists.*(?:⌘|ctrl) \+ 3/i }));
    fireEvent.focus(screen.getByRole("button", { name: /settings.*(?:⌘|ctrl) \+ 0/i }));
    expect(
      (await screen.findAllByLabelText(/(?:⌘|Ctrl) \+ 0/)).some(
        (element) => element.getAttribute("data-slot") === "kbd-group",
      ),
    ).toBe(true);
  });
});
