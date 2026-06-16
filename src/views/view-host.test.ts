import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { CommandService } from "@/infrastructure/host/commands";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";

import { ViewsRepository } from "./repository";
import { ViewsEventsToken, type ViewsEvents } from "./tokens";
import { ViewHostService } from "./view-host";

import type { View, ViewId } from "./config";
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
    blocks: [],
    ...overrides,
  };
}

function openVia(host: ReturnType<typeof build>["host"], id: string): void {
  host.commands.get(`journal:open-view:${id}`)?.callback?.();
}

function build(seeds: Record<string, View> = {}) {
  const host = createFakeHost();
  const storage: Record<string, View> = { ...seeds };
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts(storage, events);
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.addModule(createLoggerTestingModule().module);
  c.register(CommandService).useClass(CommandService);
  c.register(ViewsRepository).useValue(repo);
  c.register(ViewsEventsToken).useValue(events);
  c.register(ViewHostService).useClass(ViewHostService);
  const service = c.resolve(ViewHostService);
  return { service, host, events, repo, storage };
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

    it("does not open views when layout was already ready before initialize", async () => {
      const { service, host } = build({ a: seedView("a", { openOnStartup: true }) });
      host.workspace.layoutReady = true;
      service.initialize();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([]);
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
