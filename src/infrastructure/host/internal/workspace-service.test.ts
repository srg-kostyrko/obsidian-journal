import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { Some } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { WorkspaceOpenError } from "../errors";

import { createFakeHost } from "./testing";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";
import { WorkspaceService } from "./workspace-service";

import type { FakeHost } from "./testing";
import type { VaultPath } from "../types";

function build(): { service: WorkspaceService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(WorkspaceService).useClass(WorkspaceService);
  return { service: c.resolve(WorkspaceService), host };
}

const path = "Daily/2026-05-13.md" as VaultPath;

function noop(): void {
  // Stands in for a real MenuItemSpec callback whose invocation is not under test.
}

describe("WorkspaceService", () => {
  describe("activeNote", () => {
    it("returns None when no markdown file is active", () => {
      const { service } = build();
      expect(service.activeNote().isNone()).toBe(true);
    });

    it("returns the active file's path when one is active", () => {
      const { service, host } = build();
      const file = host.putFile(path);
      host.workspace.activeFile = file;
      const result = service.activeNote();
      expect(result).toBeInstanceOf(Some);
      expect(result.getOr("" as VaultPath)).toBe(path);
    });
  });

  describe("isOpen", () => {
    it("returns false when the path is not open in any leaf", () => {
      const { service } = build();
      expect(service.isOpen(path)).toBe(false);
    });

    it("returns true after openNote succeeds for the path", async () => {
      const { service, host } = build();
      host.putFile(path);
      await service.openNote(path);
      expect(service.isOpen(path)).toBe(true);
    });
  });

  describe("openNote", () => {
    it("opens the file using the default 'active' mode", async () => {
      const { service, host } = build();
      host.putFile(path);
      const result = await service.openNote(path);
      expectOk(result);
      expect(host.workspace.openCalls).toEqual([{ path, mode: false }]);
    });

    it("translates 'tab' mode to PaneType 'tab'", async () => {
      const { service, host } = build();
      host.putFile(path);
      await service.openNote(path, "tab");
      expect(host.workspace.openCalls.at(-1)?.mode).toBe("tab");
    });

    it("focuses the existing leaf when the note is already open in this window", async () => {
      const { service, host } = build();
      host.putFile(path);
      await service.openNote(path);

      await service.openNote(path);

      expect(host.workspace.focusedPaths).toEqual([path]);
      expect(host.workspace.openCalls).toHaveLength(1);
    });

    it("focuses a background-restored leaf already holding the note", async () => {
      const { service, host } = build();
      host.putFile(path);
      await service.openNote(path, "tab");
      host.workspace.deferredPaths.add(path);

      expectOk(await service.openNote(path));

      expect(host.workspace.openCalls).toHaveLength(1);
      expect(host.workspace.focusedPaths).toEqual([path]);
    });

    it("opens a new leaf when the note is only open in another window", async () => {
      const { service, host } = build();
      host.putFile(path);
      await service.openNote(path);
      host.workspace.activeWindow = "popout";

      await service.openNote(path);

      expect(host.workspace.focusedPaths).toEqual([]);
      expect(host.workspace.openCalls).toHaveLength(2);
    });

    it("opens a new pane for an explicit mode even when the note is already open here", async () => {
      const { service, host } = build();
      host.putFile(path);
      await service.openNote(path);

      await service.openNote(path, "tab");

      expect(host.workspace.focusedPaths).toEqual([]);
      expect(host.workspace.openCalls.at(-1)).toEqual({ path, mode: "tab" });
    });

    it("returns WorkspaceOpenError when the path is unknown", async () => {
      const { service } = build();
      const result = await service.openNote(path);
      expectErr(result);
      expect(result.error).toBeInstanceOf(WorkspaceOpenError);
    });
  });

  describe("events.active-note-changed", () => {
    it("emits Some(path) when a markdown file becomes active", () => {
      const { service, host } = build();
      const file = host.putFile(path);
      const received: (Some<VaultPath> | undefined)[] = [];
      service.events.on("active-note-changed", (option) =>
        received.push(option.match({ some: (p) => new Some(p), none: () => undefined })),
      );
      host.emitActiveLeafChange(file);
      expect(received).toHaveLength(1);
      expect(received[0]?.value).toBe(path);
    });

    it("does not clear the active note when focus moves to a leaf with no file", () => {
      // Focusing the calendar sidebar (a leaf with no file) must not clear the active note,
      // or its active-day highlight would disappear.
      const { service, host } = build();
      const file = host.putFile(path);
      const received: (VaultPath | null)[] = [];
      service.events.on("active-note-changed", (option) =>
        received.push(option.match({ some: (p) => p, none: () => null })),
      );
      host.emitActiveLeafChange(file);
      host.emitActiveLeafChange(null);
      expect(received).toEqual([path]);
    });

    it("emits Some(path) when a file opens in the already-active leaf", () => {
      // A link click or open-in-place fires file-open without active-leaf-change;
      // the active-note signal must follow it too.
      const { service, host } = build();
      const file = host.putFile(path);
      const received: string[] = [];
      service.events.on("active-note-changed", (option) => {
        if (option.isSome()) received.push(option.value);
      });
      host.emitFileOpen(file);
      expect(received).toEqual([path]);
    });

    it("stops invoking the handler after unbind", () => {
      const { service, host } = build();
      const file = host.putFile(path);
      let count = 0;
      const unbind = service.events.on("active-note-changed", () => {
        count += 1;
      });
      host.emitActiveLeafChange(file);
      unbind();
      host.emitActiveLeafChange(null);
      expect(count).toBe(1);
    });
  });

  describe("triggerHoverPreview", () => {
    it("invokes app.workspace.trigger with the link-hover signal", () => {
      const { service, host } = build();
      const event = new MouseEvent("mouseenter");
      service.triggerHoverPreview(path, event);

      expect(host.workspace.triggerCalls).toHaveLength(1);
      const [recorded] = host.workspace.triggerCalls;
      expect(recorded.event).toBe("link-hover");
      expect(recorded.arguments_[0]).toBe(host.plugin);
      expect(recorded.arguments_[1]).toBe(event.target);
      expect(recorded.arguments_[2]).toBe(path);
      expect(recorded.arguments_[3]).toBe(path);
    });
  });

  describe("openFileMenu", () => {
    it("invokes app.workspace.trigger with the file-menu signal and shows the menu at the event", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service, host } = build();
      host.putFile(path);
      const event = new MouseEvent("contextmenu");
      service.openFileMenu(path, event);

      expect(host.workspace.triggerCalls).toHaveLength(1);
      const [recorded] = host.workspace.triggerCalls;
      expect(recorded.event).toBe("file-menu");
      const menu = __testing.lastOpenMenu();
      expect(menu.showAtMouseEventCalls).toEqual([event]);
    });

    it("no-ops when the path does not resolve to a TFile", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service, host } = build();
      service.openFileMenu("Missing/file.md" as VaultPath, new MouseEvent("contextmenu"));

      expect(host.workspace.triggerCalls).toHaveLength(0);
      expect(__testing.openMenus).toHaveLength(0);
    });

    it("appends a Delete item after the file-menu contributions", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service, host } = build();
      host.putFile(path);
      service.openFileMenu(path, new MouseEvent("contextmenu"));

      const menu = __testing.lastOpenMenu();
      expect(menu.items.at(-1)?.title).toBe("Delete");
    });

    it("marks the Delete item as a warning so it matches Obsidian's destructive styling", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service, host } = build();
      host.putFile(path);
      service.openFileMenu(path, new MouseEvent("contextmenu"));

      expect(__testing.lastOpenMenu().items.at(-1)?.warning).toBe(true);
    });

    it("files the Delete item into Obsidian's danger section", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service, host } = build();
      host.putFile(path);
      service.openFileMenu(path, new MouseEvent("contextmenu"));

      expect(__testing.lastOpenMenu().items.at(-1)?.section).toBe("danger");
    });

    it("prompts Obsidian's file deletion when the Delete item is clicked", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service, host } = build();
      const file = host.putFile(path);
      service.openFileMenu(path, new MouseEvent("contextmenu"));

      const deleteItem = __testing.lastOpenMenu().items.at(-1);
      (deleteItem as unknown as { click(): void }).click();

      expect(host.promptedDeletions).toEqual([file]);
    });
  });

  describe("openPathsMenu", () => {
    it("no-ops when given no paths", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      service.openPathsMenu([], new MouseEvent("contextmenu"));

      expect(__testing.openMenus).toHaveLength(0);
    });

    it("opens the file menu directly when given exactly one path", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service, host } = build();
      host.putFile(path);
      service.openPathsMenu([path], new MouseEvent("contextmenu"));

      expect(host.workspace.triggerCalls).toHaveLength(1);
      expect(host.workspace.triggerCalls[0]?.event).toBe("file-menu");
    });

    it("shows a chooser menu with one item per path when given multiple paths", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      const other = "Daily/2026-05-14.md" as VaultPath;
      service.openPathsMenu([path, other], new MouseEvent("contextmenu"));

      const menu = __testing.lastOpenMenu();
      expect(menu.items.map((item) => item.title)).toEqual([path, other]);
    });

    it("opens the clicked path's file menu from the chooser", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service, host } = build();
      const other = "Daily/2026-05-14.md" as VaultPath;
      host.putFile(other);
      service.openPathsMenu([path, other], new MouseEvent("contextmenu"));

      const [, otherItem] = __testing.lastOpenMenu().items;
      (otherItem as unknown as { click(): void }).click();

      expect(host.workspace.triggerCalls).toHaveLength(1);
      expect(host.workspace.triggerCalls[0]?.event).toBe("file-menu");
    });

    it("shows a menu of only the extra items when there are no paths", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      service.openPathsMenu([], new MouseEvent("contextmenu"), [
        { title: "Explain decorations", icon: "info", onClick: noop },
      ]);

      const menu = __testing.lastOpenMenu();
      expect(menu.items.map((item) => item.title)).toEqual(["Explain decorations"]);
    });

    it("shows no menu when there are neither paths nor extra items", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      service.openPathsMenu([], new MouseEvent("contextmenu"), []);

      expect(__testing.openMenus).toHaveLength(0);
    });

    it("keeps Obsidian's file entries alongside an extra item for a single path", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service, host } = build();
      host.putFile(path);
      service.openPathsMenu([path], new MouseEvent("contextmenu"), [
        { title: "Explain decorations", icon: "info", onClick: noop },
      ]);

      const menu = __testing.lastOpenMenu();
      expect(menu.items.map((item) => item.title)).toContain("Explain decorations");
      expect(host.workspace.triggerCalls).toHaveLength(1);
      expect(host.workspace.triggerCalls[0]?.event).toBe("file-menu");
      // Only one menu may ever be shown for this call; a lost `!into` guard in openFileMenu
      // would show the same menu twice (once from within openFileMenu, once at the end here).
      expect(__testing.openMenus).toHaveLength(1);
    });

    it("shows no menu for a single stale path with no extra items", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      service.openPathsMenu(["Stale/gone.md" as VaultPath], new MouseEvent("contextmenu"));

      expect(__testing.openMenus).toHaveLength(0);
    });

    it("still shows the extra items' menu when the single path is stale", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      service.openPathsMenu(["Stale/gone.md" as VaultPath], new MouseEvent("contextmenu"), [
        { title: "Explain decorations", icon: "info", onClick: noop },
      ]);

      const menu = __testing.lastOpenMenu();
      expect(menu.items.map((item) => item.title)).toEqual(["Explain decorations"]);
    });

    it("prepends extra items before the path entries for several paths", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      const other = "Daily/2026-05-14.md" as VaultPath;
      service.openPathsMenu([path, other], new MouseEvent("contextmenu"), [
        { title: "Explain decorations", icon: "info", onClick: noop },
      ]);

      const menu = __testing.lastOpenMenu();
      expect(menu.items.map((item) => item.title)).toEqual(["Explain decorations", path, other]);
    });

    it("invokes an extra item's callback when it is chosen", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      let invoked = false;
      service.openPathsMenu([], new MouseEvent("contextmenu"), [
        { title: "Explain decorations", icon: "info", onClick: () => (invoked = true) },
      ]);

      const [item] = __testing.lastOpenMenu().items;
      (item as unknown as { click(): void }).click();

      expect(invoked).toBe(true);
    });
  });

  describe("pickFromMenu", () => {
    it("lists one menu item per label at the mouse event", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      const event = new MouseEvent("click");
      void service.pickFromMenu(["daily", "work"], event);

      const menu = __testing.lastOpenMenu();
      expect(menu.items.map((item) => item.title)).toEqual(["daily", "work"]);
      expect(menu.showAtMouseEventCalls).toEqual([event]);
    });

    it("resolves the clicked label", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      const result = service.pickFromMenu(["daily", "work"], new MouseEvent("click"));
      const [, work] = __testing.lastOpenMenu().items;
      (work as unknown as { click(): void }).click();

      const settled = await result;
      expect(settled.isOk() && settled.value).toBe("work");
    });

    // Obsidian's native rendering closes the menu before the main process delivers the pick.
    // The DOM rendering does the opposite. Both must land on the same answer.
    it("resolves a pick the host delivers only after closing the menu", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      const result = service.pickFromMenu(["daily", "work"], new MouseEvent("click"));
      await __testing.lastOpenMenu().pick(1);

      const settled = await result;
      expect(settled.isOk() && settled.value).toBe("work");
    });

    it("resolves a pick the host delivers before closing the menu", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      const result = service.pickFromMenu(["daily", "work"], new MouseEvent("click"));
      await __testing.lastOpenMenu().setUseNativeMenu(false).pick(1);

      const settled = await result;
      expect(settled.isOk() && settled.value).toBe("work");
    });

    it("cancels when the menu hides without a pick", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      const result = service.pickFromMenu(["daily"], new MouseEvent("click"));
      // The verdict waits out the window a native pick could still arrive in, so drive the
      // clock rather than sitting through it.
      vi.useFakeTimers();
      try {
        __testing.lastOpenMenu().hide();
        await vi.runAllTimersAsync();
      } finally {
        vi.useRealTimers();
      }

      const settled = await result;
      expect(settled.isErr()).toBe(true);
    });
  });

  describe("previewFirstPath", () => {
    // Modifier gating lives in useModifierHoverPreview (which also fires on a modifier
    // pressed mid-hover); the service previews unconditionally.
    it("no-ops when given no paths", () => {
      const { service, host } = build();
      service.previewFirstPath([], new MouseEvent("pointerenter", { ctrlKey: true }));

      expect(host.workspace.triggerCalls).toHaveLength(0);
    });

    it("previews the first path", () => {
      const { service, host } = build();
      const other = "Daily/2026-05-14.md" as VaultPath;
      service.previewFirstPath([path, other], new MouseEvent("pointerenter"));

      expect(host.workspace.triggerCalls).toHaveLength(1);
      const [recorded] = host.workspace.triggerCalls;
      expect(recorded?.event).toBe("link-hover");
      expect(recorded?.arguments_[2]).toBe(path);
    });
  });

  describe("openNote pinned", () => {
    const a = "Daily/2026-05-12.md" as VaultPath;
    const b = "Daily/2026-05-13.md" as VaultPath;
    const c = "Daily/2026-05-14.md" as VaultPath;
    const otherJournal = "Work/2026-05-12.md" as VaultPath;
    const notelet = "Daily/notelets/Standup.md" as VaultPath;
    const daily = { sameGroup: (p: VaultPath) => p.startsWith("Daily/") && !p.includes("/notelets/") };

    function withFiles(): { service: WorkspaceService; host: FakeHost } {
      const built = build();
      for (const p of [a, b, c, otherJournal, notelet]) built.host.putFile(p);
      return built;
    }

    it("opens the note per the mode and pins it when the journal has no pinned tab", async () => {
      const { service, host } = withFiles();

      expectOk(await service.openNote(a, "tab", daily));

      expect(host.workspace.openCalls).toEqual([{ path: a, mode: "tab" }]);
      expect([...host.workspace.pinnedPaths]).toEqual([a]);
    });

    it("pins the new tab before the note finishes loading into it", async () => {
      const { service, host } = withFiles();
      const load = Promise.withResolvers<void>();
      host.workspace.pendingLoad = load.promise;

      const opening = service.openNote(a, "tab", daily);
      await Promise.resolve();

      expect(host.workspace.activeFile?.path).toBe(a);
      expect([...host.workspace.pinnedPaths]).toEqual([a]);
      load.resolve();
      expectOk(await opening);
    });

    it("unpins the new tab and fails when the note does not load", async () => {
      const { service, host } = withFiles();
      host.workspace.pendingLoad = Promise.reject(new Error("read failed"));

      const result = await service.openNote(a, "tab", daily);

      expectErr(result);
      expect(result.error).toBeInstanceOf(WorkspaceOpenError);
      expect(host.workspace.openCalls).toEqual([{ path: a, mode: "tab" }]);
      expect(host.workspace.pinnedPaths).toEqual(new Set());
    });

    it("keeps the pin when another pinned open moved the tab on before the failed load settled", async () => {
      const { service, host } = withFiles();
      const load = Promise.withResolvers<void>();
      host.workspace.pendingLoad = load.promise;

      // The fake keys leaves by path, so a second openNote would retarget a different stand-in; the
      // leaf this open pinned is moved on directly instead, as a concurrent pinned open would.
      const getLeaf = vi.spyOn(host.app.workspace, "getLeaf");
      const failing = service.openNote(a, "tab", daily);
      await Promise.resolve();
      const leaf = getLeaf.mock.results.at(0)?.value as { openFile(file: unknown): Promise<void> } | undefined;
      host.workspace.pendingLoad = null;
      await leaf?.openFile(host.app.vault.getAbstractFileByPath(b));
      load.reject(new Error("read failed"));

      expectErr(await failing);
      expect([...host.workspace.pinnedPaths]).toContain(b);
    });

    it("moves the journal's pinned tab to the note instead of opening another", async () => {
      const { service, host } = withFiles();
      await service.openNote(a, "active", daily);

      await service.openNote(b, "tab", daily);

      expect(host.workspace.retargetCalls).toEqual([{ from: a, to: b }]);
      expect(host.workspace.openCalls).toHaveLength(1);
      expect([...host.workspace.pinnedPaths]).toEqual([b]);
      expect(host.workspace.focusedPaths.at(-1)).toBe(b);
    });

    it("leaves another journal's pinned tab and a pinned notelet where they are", async () => {
      const { service, host } = withFiles();
      await service.openNote(otherJournal);
      await service.openNote(notelet);
      host.workspace.pinnedPaths.add(otherJournal);
      host.workspace.pinnedPaths.add(notelet);

      await service.openNote(b, "active", daily);

      expect(host.workspace.retargetCalls).toEqual([]);
      expect(host.workspace.pinnedPaths).toEqual(new Set([otherJournal, notelet, b]));
    });

    it("does not move an unpinned tab of the journal", async () => {
      const { service, host } = withFiles();
      await service.openNote(a);

      await service.openNote(b, "active", daily);

      expect(host.workspace.retargetCalls).toEqual([]);
      expect(host.workspace.openPaths).toEqual(new Set([a, b]));
    });

    it("focuses the pinned tab that already holds the note", async () => {
      const { service, host } = withFiles();
      await service.openNote(a, "active", daily);

      await service.openNote(a, "tab", daily);

      expect(host.workspace.retargetCalls).toEqual([]);
      expect(host.workspace.openCalls).toHaveLength(1);
      expect(host.workspace.focusedPaths).toEqual([a]);
    });

    it("moves the journal's pinned tab in a popout while the main window has focus", async () => {
      const { service, host } = withFiles();
      host.workspace.activeWindow = "popout";
      await service.openNote(a, "window", daily);
      host.workspace.activeWindow = "main";

      await service.openNote(b, "active", daily);

      expect(host.workspace.retargetCalls).toEqual([{ from: a, to: b }]);
      expect(host.workspace.openWindows.get(b)).toBe("popout");
    });

    it("prefers the journal's pinned tab in the focused window", async () => {
      const { service, host } = withFiles();
      host.workspace.activeWindow = "popout";
      await service.openNote(a, "window", daily);
      host.workspace.activeWindow = "main";
      await service.openNote(c);
      host.workspace.pinnedPaths.add(c);

      await service.openNote(b, "active", daily);

      expect(host.workspace.retargetCalls).toEqual([{ from: c, to: b }]);
    });

    it("pins the unpinned tab already holding the note in this window", async () => {
      const { service, host } = withFiles();
      await service.openNote(a);

      await service.openNote(a, "tab", daily);

      expect(host.workspace.openCalls).toHaveLength(1);
      expect([...host.workspace.pinnedPaths]).toEqual([a]);
      expect(host.workspace.focusedPaths).toEqual([a]);
    });

    it("ignores a pinned journal note in a sidebar", async () => {
      const { service, host } = withFiles();
      await service.openNote(a, "active", daily);
      host.workspace.leafRoots.set(a, "right");

      await service.openNote(b, "active", daily);

      expect(host.workspace.retargetCalls).toEqual([]);
      expect(host.workspace.pinnedPaths).toEqual(new Set([a, b]));
    });

    it("opens a new pinned tab instead of pinning the target's unpinned copy in a sidebar", async () => {
      const { service, host } = withFiles();
      await service.openNote(a);
      host.workspace.leafRoots.set(a, "right");

      await service.openNote(a, "tab", daily);

      expect(host.workspace.openCalls).toHaveLength(2);
      expect(host.workspace.openCalls.at(-1)).toEqual({ path: a, mode: "tab" });
      expect(host.workspace.retargetCalls).toEqual([]);
    });

    it("prefers an exact pinned match in another window over a same-group match in this one", async () => {
      const { service, host } = withFiles();
      host.workspace.activeWindow = "popout";
      await service.openNote(b, "window", daily);
      host.workspace.activeWindow = "main";
      await service.openNote(a);
      host.workspace.pinnedPaths.add(a);

      await service.openNote(b, "active", daily);

      expect(host.workspace.retargetCalls).toEqual([]);
      expect(host.workspace.focusedPaths.at(-1)).toBe(b);
    });

    it("does not reuse an unpinned copy of the target open in another window", async () => {
      const { service, host } = withFiles();
      host.workspace.activeWindow = "popout";
      await service.openNote(a);
      host.workspace.activeWindow = "main";

      await service.openNote(a, "tab", daily);

      expect(host.workspace.openCalls).toHaveLength(2);
      expect(host.workspace.retargetCalls).toEqual([]);
      expect([...host.workspace.pinnedPaths]).toEqual([a]);
    });

    it("moves the journal's pinned tab restored into the background instead of pinning another", async () => {
      const { service, host } = withFiles();
      await service.openNote(a, "active", daily);
      host.workspace.deferredPaths.add(a);

      await service.openNote(b, "tab", daily);

      expect(host.workspace.retargetCalls).toEqual([{ from: a, to: b }]);
      expect(host.workspace.openCalls).toHaveLength(1);
      expect([...host.workspace.pinnedPaths]).toEqual([b]);
    });

    it("focuses the background-restored pinned tab that already holds the note", async () => {
      const { service, host } = withFiles();
      await service.openNote(a, "active", daily);
      host.workspace.deferredPaths.add(a);

      await service.openNote(a, "tab", daily);

      expect(host.workspace.retargetCalls).toEqual([]);
      expect(host.workspace.openCalls).toHaveLength(1);
      expect(host.workspace.focusedPaths).toEqual([a]);
    });

    it("pins the target's main-area tab when an unpinned copy also sits in a sidebar", async () => {
      const { service, host } = withFiles();
      await service.openNote(a);
      host.workspace.sidebarCopies.set(a, "right");

      await service.openNote(a, "tab", daily);

      expect(host.workspace.openCalls).toHaveLength(1);
      expect([...host.workspace.pinnedPaths]).toEqual([a]);
      expect(host.workspace.focusedPaths).toEqual([a]);
    });
  });
});
