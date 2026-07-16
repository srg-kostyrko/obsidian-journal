import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { CommandService } from "@/infrastructure/host/commands";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { SuggestService } from "@/infrastructure/host/suggests";
import { FakeSuggestService } from "@/infrastructure/host/suggests/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
import { ShelvesRepository, type ShelfConfig } from "@/shelves";
import { fakeShelvesRepo } from "@/shelves/testing";

import { FALLBACK_VIEW_ICON, type View, type ViewId } from "./config";
import { DEFAULT_CALENDAR_VIEW_ID } from "./default-view";
import { ViewsRepository } from "./repository";
import { ViewsEventsToken, type ViewsEvents } from "./tokens";
import { ViewHostService } from "./view-host";

import type { WorkspaceLeaf } from "obsidian";

function seedView(id: string, overrides: Partial<View> = {}): View {
  return {
    id: id as ViewId,
    name: "View " + id,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    leaf: "right",
    openOnStartup: false,
    rememberDate: false,
    blocks: [],
    ...overrides,
  };
}

function openVia(host: ReturnType<typeof build>["host"], id: string): void {
  host.commands.get(`journal:open-view:${id}`)?.callback?.();
}

function build(seeds: Record<string, View> = {}, shelves: Record<string, ShelfConfig> = {}) {
  const host = createFakeHost();
  const storage: Record<string, View> = { ...seeds };
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts(storage, events);
  const suggests = new FakeSuggestService();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.addModule(createLoggerTestingModule().module);
  c.register(CommandService).useClass(CommandService);
  c.register(ViewsRepository).useValue(repo);
  c.register(ViewsEventsToken).useValue(events);
  c.register(ShelvesRepository).useValue(fakeShelvesRepo(shelves));
  c.register(SuggestService).useValue(suggests as unknown as SuggestService);
  c.register(ViewHostService).useClass(ViewHostService);
  const service = c.resolve(ViewHostService);
  return { service, host, events, repo, storage, suggests };
}

function shelf(name: string): ShelfConfig {
  return { name, journals: [] };
}

describe("ViewHostService", () => {
  describe("registerAll", () => {
    it("registers an Obsidian view type per seeded view", () => {
      const { host } = build({ a: seedView("a"), b: seedView("b") });
      expect([...host.registeredViews.keys()]).toEqual(["journal-view:a", "journal-view:b"]);
    });

    it("registers a command per seeded view", () => {
      const { host } = build({ a: seedView("a") });
      expect(host.commands.has("journal:open-view:a")).toBe(true);
    });

    it("adds a ribbon icon when showInRibbon is true", () => {
      const { host } = build({ a: seedView("a", { showInRibbon: true }) });
      const ribbonIds = host.ribbonIcons.map((r) => r.id);
      expect(ribbonIds).toContain("journal-command:journal:open-view:a");
    });

    it("skips the ribbon icon when showInRibbon is false", () => {
      const { host } = build({ b: seedView("b") });
      const ribbonIds = host.ribbonIcons.map((r) => r.id);
      expect(ribbonIds).not.toContain("journal-command:journal:open-view:b");
    });

    it("registers the command with a generic icon when the view has no icon", () => {
      const { host } = build({ a: seedView("a", { icon: "" }) });
      expect(host.commands.get("journal:open-view:a")?.icon).toBe(FALLBACK_VIEW_ICON);
    });
  });

  describe("created event", () => {
    it("registers the new view type", () => {
      const { host, events, storage } = build();
      storage.new = seedView("new");
      events.emit("created", "new" as ViewId);
      expect(host.registeredViews.has("journal-view:new")).toBe(true);
    });
  });

  describe("updated event", () => {
    it("re-syncs the command label without re-registering the view type", () => {
      const { host, events, storage } = build({ a: seedView("a", { name: "Old" }) });
      const before = host.registeredViews.size;
      storage.a.name = "New";
      events.emit("updated", "a" as ViewId, { name: "New" });
      expect(host.registeredViews.size).toBe(before);
      expect(host.commands.get("journal:open-view:a")?.name).toBe("Open New");
    });

    it("refreshes an open leaf's header so a changed icon shows without reopening", async () => {
      const { host, events, storage } = build({ a: seedView("a", { icon: "calendar-days" }) });
      openVia(host, "a");
      await Promise.resolve();
      storage.a.icon = "star";
      events.emit("updated", "a" as ViewId, { icon: "star" });
      expect(host.workspace.headerRefreshedTypes).toContain("journal-view:a");
    });

    it("does not let a failing header refresh break the update event", async () => {
      const { host, events, storage } = build({ a: seedView("a") });
      openVia(host, "a");
      await Promise.resolve();
      host.workspace.updateHeaderThrows = true;
      storage.a.icon = "star";
      expect(() => events.emit("updated", "a" as ViewId, { icon: "star" })).not.toThrow();
    });
  });

  describe("deleted event", () => {
    it("detaches every leaf of that view type", () => {
      const { host, events } = build({ a: seedView("a") });
      events.emit("deleted", "a" as ViewId);
      expect(host.workspace.detachedTypes).toContain("journal-view:a");
    });

    it("removes the command", () => {
      const { host, events } = build({ a: seedView("a") });
      events.emit("deleted", "a" as ViewId);
      expect(host.commands.has("journal:open-view:a")).toBe(false);
    });

    it("removes the ribbon icon if it was added", () => {
      const { host, events } = build({ a: seedView("a", { showInRibbon: true }) });
      expect(host.ribbonIcons.some((r) => r.id === "journal-command:journal:open-view:a")).toBe(true);
      events.emit("deleted", "a" as ViewId);
      expect(host.ribbonIcons.some((r) => r.id === "journal-command:journal:open-view:a")).toBe(false);
    });
  });

  describe("stale viewType", () => {
    it("renders an empty leaf when the view type is opened after deletion", () => {
      const { host, events } = build({ a: seedView("a") });
      const factory = host.registeredViews.get("journal-view:a")!.factory;
      events.emit("deleted", "a" as ViewId);
      const leafStub = { containerEl: document.createElement("div") } as unknown as WorkspaceLeaf;
      const result = factory(leafStub);
      expect(result.getDisplayText()).toBe("Stale view");
    });
  });

  describe("change-shelf command", () => {
    it("registers a change-shelf command per view", () => {
      const { host } = build({ a: seedView("a") });
      expect(host.commands.has("journal:change-shelf:a")).toBe(true);
    });

    it("hides the command when no shelves exist", () => {
      const { host } = build({ a: seedView("a") });
      openVia(host, "a");
      expect(host.commands.get("journal:change-shelf:a")?.checkCallback?.(true)).toBe(false);
    });

    it("hides the command while the view is not open", () => {
      const { host } = build({ a: seedView("a") }, { work: shelf("work") });
      expect(host.commands.get("journal:change-shelf:a")?.checkCallback?.(true)).toBe(false);
    });

    it("offers all-journals plus every shelf when invoked", async () => {
      const { host, suggests } = build({ a: seedView("a") }, { work: shelf("work"), home: shelf("home") });
      openVia(host, "a");
      await Promise.resolve();
      host.commands.get("journal:change-shelf:a")?.checkCallback?.(false);
      expect(suggests.lastOpen().input).toEqual([m.common_label_all_journals(), "work", "home"]);
    });
  });

  describe("stable open-calendar command", () => {
    // v2 exposed one fixed `open-calendar` id users bound hotkeys to; the alias keeps
    // those bindings working across the dynamic per-view commands.
    it("registers the fixed open-calendar id alongside per-view commands", () => {
      const { host } = build({ a: seedView("a") });
      expect(host.commands.has("open-calendar")).toBe(true);
    });

    it("opens the default Calendar view when invoked", async () => {
      const { host } = build({
        a: seedView("a"),
        [DEFAULT_CALENDAR_VIEW_ID]: seedView(DEFAULT_CALENDAR_VIEW_ID),
      });
      host.commands.get("open-calendar")?.checkCallback?.(false);
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([
        { type: `journal-view:${DEFAULT_CALENDAR_VIEW_ID}`, placement: "right" },
      ]);
    });

    it("falls back to the first view when the default Calendar view is gone", async () => {
      const { host } = build({ a: seedView("a") });
      host.commands.get("open-calendar")?.checkCallback?.(false);
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "right" }]);
    });

    it("is hidden from the palette when no views exist", () => {
      const { host } = build({});
      expect(host.commands.get("open-calendar")?.checkCallback?.(true)).toBe(false);
    });
  });

  describe("open placement", () => {
    it("opens a left-placed view via the left sidebar leaf", async () => {
      const { host } = build({ a: seedView("a", { leaf: "left" }) });
      openVia(host, "a");
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "left" }]);
    });

    it("opens a right-placed view via the right sidebar leaf", async () => {
      const { host } = build({ a: seedView("a", { leaf: "right" }) });
      openVia(host, "a");
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "right" }]);
    });

    it("opens a tab-placed view via a main-area tab", async () => {
      const { host } = build({ a: seedView("a", { leaf: "tab" }) });
      openVia(host, "a");
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "tab" }]);
    });

    it("falls back to a main-area tab when the sidebar leaf is unavailable", async () => {
      const { host } = build({ a: seedView("a", { leaf: "right" }) });
      host.workspace.sidebarLeafAvailable = false;
      openVia(host, "a");
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "tab" }]);
    });
  });

  describe("open dedupe", () => {
    it("reveals the existing leaf instead of opening a second one", async () => {
      const { host } = build({ a: seedView("a", { leaf: "right" }) });
      openVia(host, "a");
      await Promise.resolve();
      openVia(host, "a");
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "right" }]);
    });
  });

  describe("isOpen", () => {
    it("reports a view with no open leaves as closed", () => {
      const { service } = build({ a: seedView("a") });
      expect(service.isOpen("a" as ViewId)).toBe(false);
    });

    it("reports a view as open once its leaf has been opened", async () => {
      const { service, host } = build({ a: seedView("a") });
      openVia(host, "a");
      await Promise.resolve();
      expect(service.isOpen("a" as ViewId)).toBe(true);
    });
  });

  describe("reposition", () => {
    it("reopens the view at the newly configured mode after detaching the old leaf", async () => {
      const { service, host, storage } = build({ a: seedView("a", { leaf: "right" }) });
      openVia(host, "a");
      await Promise.resolve();
      storage.a.leaf = "tab";

      await service.reposition("a" as ViewId);

      expect(host.workspace.detachedTypes).toContain("journal-view:a");
      expect(host.workspace.viewStateCalls.at(-1)).toEqual({ type: "journal-view:a", placement: "tab" });
    });

    it("opens one tab per open leaf when repositioning to a new tab", async () => {
      const { service, host, storage } = build({ a: seedView("a", { leaf: "right" }) });
      await host.app.workspace.getRightLeaf(false)!.setViewState({ type: "journal-view:a" });
      await host.app.workspace.getRightLeaf(false)!.setViewState({ type: "journal-view:a" });
      storage.a.leaf = "tab";
      host.workspace.viewStateCalls.length = 0;

      await service.reposition("a" as ViewId);

      expect(host.workspace.viewStateCalls).toEqual([
        { type: "journal-view:a", placement: "tab" },
        { type: "journal-view:a", placement: "tab" },
      ]);
    });

    it("does nothing when no leaf of the view is open", async () => {
      const { service, host } = build({ a: seedView("a") });
      await service.reposition("a" as ViewId);
      expect(host.workspace.viewStateCalls).toEqual([]);
      expect(host.workspace.detachedTypes).toEqual([]);
    });
  });

  describe("initialize", () => {
    it("opens an opted-in view once layout becomes ready at launch", async () => {
      const { service, host } = build({ a: seedView("a", { openOnStartup: true }) });
      host.workspace.layoutReady = false;
      service.initialize();
      host.setLayoutReady();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "right" }]);
    });

    it("does not open a view that has not opted in", async () => {
      const { service, host } = build({ a: seedView("a", { openOnStartup: false }) });
      host.workspace.layoutReady = false;
      service.initialize();
      host.setLayoutReady();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([]);
    });

    it("opens an opted-in view when layout was already ready before initialize", async () => {
      const { service, host } = build({ a: seedView("a", { openOnStartup: true }) });
      host.workspace.layoutReady = true;
      service.initialize();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "right" }]);
    });

    it("places an opted-in view on startup without revealing it", async () => {
      const { service, host } = build({ a: seedView("a", { openOnStartup: true }) });
      host.workspace.layoutReady = false;
      service.initialize();
      host.setLayoutReady();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: "journal-view:a", placement: "right" }]);
      expect(host.workspace.revealLeafCalls).toBe(0);
    });

    it("leaves a view already restored from the layout untouched on startup", async () => {
      const { service, host } = build({ a: seedView("a", { openOnStartup: true }) });
      await host.app.workspace.getRightLeaf(false)!.setViewState({ type: "journal-view:a" });
      host.workspace.viewStateCalls.length = 0;
      host.workspace.layoutReady = false;
      service.initialize();
      host.setLayoutReady();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([]);
      expect(host.workspace.revealLeafCalls).toBe(0);
    });
  });

  describe("open", () => {
    it("reveals the leaf when opened via a command", async () => {
      const { host } = build({ a: seedView("a", { leaf: "right" }) });
      openVia(host, "a");
      await Promise.resolve();
      expect(host.workspace.revealLeafCalls).toBeGreaterThan(0);
    });
  });

  describe("dispose", () => {
    it("detaches every registered view type", () => {
      const { service, host } = build({ a: seedView("a"), b: seedView("b") });
      service.dispose();
      expect(host.workspace.detachedTypes).toContain("journal-view:a");
      expect(host.workspace.detachedTypes).toContain("journal-view:b");
    });
  });
});
