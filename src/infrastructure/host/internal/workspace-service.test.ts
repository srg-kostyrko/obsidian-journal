import { describe, expect, it } from "vitest";

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
      // v2 tracked only file-open, so focusing the calendar sidebar (a leaf with no file) never
      // cleared the active note; the calendar's active-day highlight must persist.
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
      // the active-note signal must follow it too (v2 tracked file-open).
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

    it("cancels when the menu hides without a pick", async () => {
      const { __testing } = await import("obsidian");
      __testing.reset();

      const { service } = build();
      const result = service.pickFromMenu(["daily"], new MouseEvent("click"));
      __testing.lastOpenMenu().hide();

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
});
