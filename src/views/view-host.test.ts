import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import type { FakeHost } from "@/infrastructure/host/internal/testing";
import { journalsCoreModule } from "@/journals/module";
import type { ShelfConfig } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { FALLBACK_VIEW_ICON, viewsCollection, type View, type ViewId } from "./config";
import { DEFAULT_CALENDAR_VIEW_ID } from "./default-view";
import { viewsModule } from "./module";
import { ViewsRepository } from "./repository";
import { buildView } from "./testing";
import { ViewsEventsToken } from "./tokens";
import { ViewHostService } from "./view-host";

import type { WorkspaceLeaf } from "obsidian";

const VIEW_A = "11111111-1111-4111-8111-111111111111" as ViewId;
const VIEW_B = "22222222-2222-4222-8222-222222222222" as ViewId;
const VIEW_NEW = "33333333-3333-4333-8333-333333333333" as ViewId;

function openVia(host: FakeHost, id: ViewId): void {
  host.commands.get(`open-view:${id}`)?.callback?.();
}

// The subject IS the host registration, so this is the one file in the sweep that boots the
// FULL viewsModule (ViewHostService lives in viewsStartupModule) with allow.hostState letting
// the commands/ribbon icons/view types it registers stand.
async function build(seeds: Record<string, View> = {}, shelves: Record<string, ShelfConfig> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsModule],
    data: { views: seeds, shelves },
    allow: { hostState: true },
  });
  return {
    service: harness.resolve(ViewHostService),
    host: harness.host,
    events: harness.resolve(ViewsEventsToken),
    repo: harness.resolve(ViewsRepository),
    storage: harness.settings.recordOf(viewsCollection),
    suggests: harness.suggests,
  };
}

describe("ViewHostService", () => {
  describe("registerAll", () => {
    it("registers an Obsidian view type per seeded view", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A), [VIEW_B]: buildView(VIEW_B) });
      expect([...host.registeredViews.keys()]).toEqual([`journal-view:${VIEW_A}`, `journal-view:${VIEW_B}`]);
    });

    it("registers a command per seeded view", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A) });
      expect(host.commands.has(`open-view:${VIEW_A}`)).toBe(true);
    });

    it("adds a ribbon icon when showInRibbon is true", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A, { showInRibbon: true }) });
      const ribbonIds = host.ribbonIcons.map((r) => r.id);
      expect(ribbonIds).toContain(`journal-command:open-view:${VIEW_A}`);
    });

    it("skips the ribbon icon when showInRibbon is false", async () => {
      const { host } = await build({ [VIEW_B]: buildView(VIEW_B) });
      const ribbonIds = host.ribbonIcons.map((r) => r.id);
      expect(ribbonIds).not.toContain(`journal-command:open-view:${VIEW_B}`);
    });

    it("registers the command with a generic icon when the view has no icon", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A, { icon: "" }) });
      expect(host.commands.get(`open-view:${VIEW_A}`)?.icon).toBe(FALLBACK_VIEW_ICON);
    });
  });

  describe("created event", () => {
    it("registers the new view type", async () => {
      const { host, events, storage } = await build();
      storage[VIEW_NEW] = buildView(VIEW_NEW);
      events.emit("created", VIEW_NEW);
      expect(host.registeredViews.has(`journal-view:${VIEW_NEW}`)).toBe(true);
    });
  });

  describe("updated event", () => {
    it("re-syncs the command label without re-registering the view type", async () => {
      const { host, events, storage } = await build({ [VIEW_A]: buildView(VIEW_A, { name: "Old" }) });
      const before = host.registeredViews.size;
      storage[VIEW_A].name = "New";
      events.emit("updated", VIEW_A, { name: "New" });
      expect(host.registeredViews.size).toBe(before);
      expect(host.commands.get(`open-view:${VIEW_A}`)?.name).toBe("Open New");
    });

    it("refreshes an open leaf's header so a changed icon shows without reopening", async () => {
      const { host, events, storage } = await build({ [VIEW_A]: buildView(VIEW_A, { icon: "calendar-days" }) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      storage[VIEW_A].icon = "star";
      events.emit("updated", VIEW_A, { icon: "star" });
      expect(host.workspace.headerRefreshedTypes).toContain(`journal-view:${VIEW_A}`);
    });

    it("does not let a failing header refresh break the update event", async () => {
      const { host, events, storage } = await build({ [VIEW_A]: buildView(VIEW_A) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      host.workspace.updateHeaderThrows = true;
      storage[VIEW_A].icon = "star";
      expect(() => events.emit("updated", VIEW_A, { icon: "star" })).not.toThrow();
    });
  });

  describe("deleted event", () => {
    it("detaches every leaf of that view type", async () => {
      const { host, events } = await build({ [VIEW_A]: buildView(VIEW_A) });
      events.emit("deleted", VIEW_A);
      expect(host.workspace.detachedTypes).toContain(`journal-view:${VIEW_A}`);
    });

    it("removes the command", async () => {
      const { host, events } = await build({ [VIEW_A]: buildView(VIEW_A) });
      events.emit("deleted", VIEW_A);
      expect(host.commands.has(`open-view:${VIEW_A}`)).toBe(false);
    });

    it("removes the ribbon icon if it was added", async () => {
      const { host, events } = await build({ [VIEW_A]: buildView(VIEW_A, { showInRibbon: true }) });
      expect(host.ribbonIcons.some((r) => r.id === `journal-command:open-view:${VIEW_A}`)).toBe(true);
      events.emit("deleted", VIEW_A);
      expect(host.ribbonIcons.some((r) => r.id === `journal-command:open-view:${VIEW_A}`)).toBe(false);
    });
  });

  describe("stale viewType", () => {
    it("renders an empty leaf when the view type is opened after deletion", async () => {
      const { host, events } = await build({ [VIEW_A]: buildView(VIEW_A) });
      const factory = host.registeredViews.get(`journal-view:${VIEW_A}`)!.factory;
      events.emit("deleted", VIEW_A);
      const leafStub = { containerEl: document.createElement("div") } as unknown as WorkspaceLeaf;
      const result = factory(leafStub);
      expect(result.getDisplayText()).toBe("Stale view");
    });
  });

  describe("change-shelf command", () => {
    it("registers a change-shelf command per view", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A) });
      expect(host.commands.has(`change-shelf:${VIEW_A}`)).toBe(true);
    });

    it("hides the command when no shelves exist", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A) });
      openVia(host, VIEW_A);
      expect(host.commands.get(`change-shelf:${VIEW_A}`)?.checkCallback?.(true)).toBe(false);
    });

    it("hides the command while the view is not open", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A) }, { work: buildShelf("work") });
      expect(host.commands.get(`change-shelf:${VIEW_A}`)?.checkCallback?.(true)).toBe(false);
    });

    it("offers all-journals plus every shelf when invoked", async () => {
      const { host, suggests } = await build(
        { [VIEW_A]: buildView(VIEW_A) },
        { work: buildShelf("work"), home: buildShelf("home") },
      );
      openVia(host, VIEW_A);
      await Promise.resolve();
      host.commands.get(`change-shelf:${VIEW_A}`)?.checkCallback?.(false);
      expect(suggests.lastOpen().input).toEqual([m.common_label_all_journals(), "work", "home"]);
    });
  });

  describe("default Calendar view command", () => {
    // A fixed `open-calendar` id predates per-view generated ids; the seeded view owns that
    // id so existing hotkey bindings survive without a second command twinning it in the palette.
    it("registers the default Calendar view under the fixed open-calendar id", async () => {
      const { host } = await build({ [DEFAULT_CALENDAR_VIEW_ID]: buildView(DEFAULT_CALENDAR_VIEW_ID) });
      expect(host.commands.has("open-calendar")).toBe(true);
    });

    it("leaves the default Calendar view without a generated open command", async () => {
      const { host } = await build({ [DEFAULT_CALENDAR_VIEW_ID]: buildView(DEFAULT_CALENDAR_VIEW_ID) });
      expect(host.commands.has(`open-view:${DEFAULT_CALENDAR_VIEW_ID}`)).toBe(false);
    });

    it("opens the default Calendar view when invoked", async () => {
      const { host } = await build({ [DEFAULT_CALENDAR_VIEW_ID]: buildView(DEFAULT_CALENDAR_VIEW_ID) });
      host.commands.get("open-calendar")?.callback?.();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([
        { type: `journal-view:${DEFAULT_CALENDAR_VIEW_ID}`, placement: "right" },
      ]);
    });

    it("removes the fixed command when the default Calendar view is deleted", async () => {
      const { host, events } = await build({ [DEFAULT_CALENDAR_VIEW_ID]: buildView(DEFAULT_CALENDAR_VIEW_ID) });
      events.emit("deleted", DEFAULT_CALENDAR_VIEW_ID);
      expect(host.commands.has("open-calendar")).toBe(false);
    });

    it("registers no fixed command when the default Calendar view is absent", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A) });
      expect(host.commands.has("open-calendar")).toBe(false);
    });
  });

  describe("open placement", () => {
    it("opens a left-placed view via the left sidebar leaf", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A, { leaf: "left" }) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: `journal-view:${VIEW_A}`, placement: "left" }]);
    });

    it("opens a right-placed view via the right sidebar leaf", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A, { leaf: "right" }) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: `journal-view:${VIEW_A}`, placement: "right" }]);
    });

    it("opens a tab-placed view via a main-area tab", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A, { leaf: "tab" }) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: `journal-view:${VIEW_A}`, placement: "tab" }]);
    });

    it("falls back to a main-area tab when the sidebar leaf is unavailable", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A, { leaf: "right" }) });
      host.workspace.sidebarLeafAvailable = false;
      openVia(host, VIEW_A);
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: `journal-view:${VIEW_A}`, placement: "tab" }]);
    });
  });

  describe("open dedupe", () => {
    it("reveals the existing leaf instead of opening a second one", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A, { leaf: "right" }) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      openVia(host, VIEW_A);
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: `journal-view:${VIEW_A}`, placement: "right" }]);
    });
  });

  describe("isOpen", () => {
    it("reports a view with no open leaves as closed", async () => {
      const { service } = await build({ [VIEW_A]: buildView(VIEW_A) });
      expect(service.isOpen(VIEW_A)).toBe(false);
    });

    it("reports a view as open once its leaf has been opened", async () => {
      const { service, host } = await build({ [VIEW_A]: buildView(VIEW_A) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      expect(service.isOpen(VIEW_A)).toBe(true);
    });
  });

  describe("reposition", () => {
    it("reopens the view at the newly configured mode after detaching the old leaf", async () => {
      const { service, host, storage } = await build({ [VIEW_A]: buildView(VIEW_A, { leaf: "right" }) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      storage[VIEW_A].leaf = "tab";

      await service.reposition(VIEW_A);

      expect(host.workspace.detachedTypes).toContain(`journal-view:${VIEW_A}`);
      expect(host.workspace.viewStateCalls.at(-1)).toEqual({ type: `journal-view:${VIEW_A}`, placement: "tab" });
    });

    it("opens one tab per open leaf when repositioning to a new tab", async () => {
      const { service, host, storage } = await build({ [VIEW_A]: buildView(VIEW_A, { leaf: "right" }) });
      await host.app.workspace.getRightLeaf(false)!.setViewState({ type: `journal-view:${VIEW_A}` });
      await host.app.workspace.getRightLeaf(false)!.setViewState({ type: `journal-view:${VIEW_A}` });
      storage[VIEW_A].leaf = "tab";
      host.workspace.viewStateCalls.length = 0;

      await service.reposition(VIEW_A);

      expect(host.workspace.viewStateCalls).toEqual([
        { type: `journal-view:${VIEW_A}`, placement: "tab" },
        { type: `journal-view:${VIEW_A}`, placement: "tab" },
      ]);
    });

    it("places the moved leaf without activating it", async () => {
      const { service, host, storage } = await build({ [VIEW_A]: buildView(VIEW_A, { leaf: "right" }) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      storage[VIEW_A].leaf = "tab";

      await service.reposition(VIEW_A);

      expect(host.workspace.activatedTypes).toEqual([]);
    });

    it("does nothing when no leaf of the view is open", async () => {
      const { service, host } = await build({ [VIEW_A]: buildView(VIEW_A) });
      await service.reposition(VIEW_A);
      expect(host.workspace.viewStateCalls).toEqual([]);
      expect(host.workspace.detachedTypes).toEqual([]);
    });
  });

  describe("initialize", () => {
    it("opens an opted-in view once layout becomes ready at launch", async () => {
      const { service, host } = await build({ [VIEW_A]: buildView(VIEW_A, { openOnStartup: true }) });
      host.workspace.layoutReady = false;
      service.initialize();
      host.setLayoutReady();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: `journal-view:${VIEW_A}`, placement: "right" }]);
    });

    it("does not open a view that has not opted in", async () => {
      const { service, host } = await build({ [VIEW_A]: buildView(VIEW_A, { openOnStartup: false }) });
      host.workspace.layoutReady = false;
      service.initialize();
      host.setLayoutReady();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([]);
    });

    it("opens an opted-in view when layout was already ready before initialize", async () => {
      const { service, host } = await build({ [VIEW_A]: buildView(VIEW_A, { openOnStartup: true }) });
      host.workspace.layoutReady = true;
      service.initialize();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: `journal-view:${VIEW_A}`, placement: "right" }]);
    });

    it("places an opted-in view on startup without revealing it", async () => {
      const { service, host } = await build({ [VIEW_A]: buildView(VIEW_A, { openOnStartup: true }) });
      host.workspace.layoutReady = false;
      service.initialize();
      host.setLayoutReady();
      await Promise.resolve();
      expect(host.workspace.viewStateCalls).toEqual([{ type: `journal-view:${VIEW_A}`, placement: "right" }]);
      expect(host.workspace.revealLeafCalls).toBe(0);
    });

    it("leaves a view already restored from the layout untouched on startup", async () => {
      const { service, host } = await build({ [VIEW_A]: buildView(VIEW_A, { openOnStartup: true }) });
      await host.app.workspace.getRightLeaf(false)!.setViewState({ type: `journal-view:${VIEW_A}` });
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
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A, { leaf: "right" }) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      expect(host.workspace.revealLeafCalls).toBeGreaterThan(0);
    });

    // Obsidian focuses an activated leaf, and focusing a leaf closes an open settings window —
    // opening a view from its own settings page would then dismiss the settings the user is in.
    it("places the leaf without activating it", async () => {
      const { host } = await build({ [VIEW_A]: buildView(VIEW_A, { leaf: "right" }) });
      openVia(host, VIEW_A);
      await Promise.resolve();
      expect(host.workspace.activatedTypes).toEqual([]);
    });
  });

  describe("dispose", () => {
    it("detaches every registered view type", async () => {
      const { service, host } = await build({ [VIEW_A]: buildView(VIEW_A), [VIEW_B]: buildView(VIEW_B) });
      service.dispose();
      expect(host.workspace.detachedTypes).toContain(`journal-view:${VIEW_A}`);
      expect(host.workspace.detachedTypes).toContain(`journal-view:${VIEW_B}`);
    });
  });
});
