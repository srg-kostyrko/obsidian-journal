import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { h, nextTick } from "vue";

import type { AnchorString } from "@/calendar/types";
import { m } from "@/i18n";
import { Container, InjectorToken } from "@/infrastructure/di";
import { WorkspaceService } from "@/infrastructure/host";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { FakeWorkspaceService } from "@/infrastructure/host/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
import { CycleService, JournalsIndex, JournalsRepository, JournalsViewModel, type JournalConfig } from "@/journals";
import { fakeRepo, fixedJournal } from "@/journals/testing";
import { ActiveEntryViewModel } from "@/notes-calendar";
import { FakeActiveEntryViewModel } from "@/notes-calendar/testing";
import { ShelvesEventsToken, ShelvesRepository } from "@/shelves";
import type { ShelvesEvents } from "@/shelves";
import { fakeShelvesRepo } from "@/shelves/testing";

import { dividerBlock } from "./blocks/divider/divider-block";
import { toolbarBlock } from "./blocks/toolbar/toolbar-block";
import { ToolbarItemsService } from "./blocks/toolbar/toolbar-items-service";
import { FALLBACK_VIEW_ICON, type BlockInstanceId, type View, type ViewId } from "./config";
import { defineViewBlock, type ViewBlockDefinition } from "./define-view-block";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ToolbarItemDefinitionToken, ViewBlockDefinitionToken, ViewsEventsToken, type ViewsEvents } from "./tokens";
import { shelfSelectorItem } from "./toolbar-items/shelf-selector/shelf-selector-item";
import { useViewContext, type ViewContext } from "./view-context";
import { JournalViewLeaf } from "./view-leaf";

import type { WorkspaceLeaf } from "obsidian";

const noop = () => null;

// The root component's follow-active-note watcher (Task 2) resolves these regardless of
// whether a test cares about following; every container that reaches onOpen needs them wired.
function registerFollowDependencies(c: Container, journals: Record<string, JournalConfig> = {}): void {
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsViewModel).useClass(JournalsViewModel);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(WorkspaceService).useValue(new FakeWorkspaceService() as unknown as WorkspaceService);
  c.register(ActiveEntryViewModel).useValue(new FakeActiveEntryViewModel() as unknown as ActiveEntryViewModel);
}

// A view block whose sole job is to grab the live ViewContext so a test can read
// refDate / refDateOrigin the same way a real block would, without asserting on DOM shape.
interface ContextProbe {
  context: ViewContext | null;
}

function renderEmptyDiv() {
  return h("div");
}

function contextProbeBlock(): { block: ViewBlockDefinition; probe: ContextProbe } {
  const probe: ContextProbe = { context: null };
  const block = defineViewBlock<unknown>({
    key: "context-probe",
    label: "Probe",
    schema: v.object({}),
    defaultConfig: {},
    component: {
      setup() {
        probe.context = useViewContext();
        return renderEmptyDiv;
      },
    },
  });
  return { block, probe };
}

function seedView(overrides: Partial<View> = {}): View {
  return {
    id: "abc" as ViewId,
    name: "Calendar",
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    leaf: "right",
    openOnStartup: false,
    rememberDate: false,
    followActiveDate: true,
    blocks: [],
    ...overrides,
  };
}

function build(
  view: View = seedView(),
  options: { journals?: Record<string, JournalConfig>; blocks?: readonly ViewBlockDefinition[] } = {},
) {
  const host = createFakeHost();
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts({ [view.id]: view }, events);
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.addModule(createLoggerTestingModule().module);
  c.register(ViewsEventsToken).useValue(events);
  c.register(ViewsRepository).useValue(repo);
  c.register(ToolbarItemsService).useClass(ToolbarItemsService);
  c.register(ShelvesRepository).useValue(fakeShelvesRepo());
  c.register(ShelvesEventsToken).useValue(createNanoEvents<ShelvesEvents>());
  c.register(ViewsService).useClass(ViewsService);
  const blocks = options.blocks ?? [];
  for (const block of blocks) c.register(ViewBlockDefinitionToken).useValue(block);
  registerFollowDependencies(c, options.journals);
  const containerEl = document.createElement("div");
  const leafStub = { containerEl };
  const injector = c.resolve(InjectorToken);
  return {
    leafInstance: new JournalViewLeaf(leafStub as unknown as WorkspaceLeaf, view.id, injector),
    host,
    containerEl,
    injector,
    c,
    activeEntry: c.resolve(ActiveEntryViewModel) as unknown as FakeActiveEntryViewModel,
  };
}

function buildFollowingView(overrides: Partial<View> = {}) {
  const { block, probe } = contextProbeBlock();
  const view = seedView({
    blocks: [{ id: "block-id" as BlockInstanceId, key: "context-probe", config: {} }],
    ...overrides,
  });
  const { leafInstance, activeEntry } = build(view, {
    journals: { daily: fixedJournal("daily", { type: "day" }) },
    blocks: [block],
  });
  const leaf = leafInstance as unknown as { onOpen(): Promise<void>; onClose(): Promise<void> };
  return { leaf, leafInstance, probe, activeEntry };
}

describe("JournalViewLeaf", () => {
  describe("setState", () => {
    it("stores refDate from incoming state", async () => {
      const { leafInstance } = build(seedView({ rememberDate: true }));
      await leafInstance.setState({ refDate: "2026-06-01" }, {});
      const state = leafInstance.getState() as { refDate?: AnchorString };
      expect(state.refDate).toBe("2026-06-01");
    });

    it("calls workspace.requestSaveLayout when state changes", async () => {
      const { leafInstance, host } = build();
      const before = host.workspace.saveLayoutCalls;
      await leafInstance.setState({ refDate: "2026-06-01" }, {});
      expect(host.workspace.saveLayoutCalls).toBe(before + 1);
    });

    it("replaces full state on each call (keys absent from incoming state are dropped)", async () => {
      const { leafInstance } = build();
      await leafInstance.setState({ refDate: "2026-06-01", shelf: "A" }, {});
      await leafInstance.setState({ shelf: "B" }, {});
      const state = leafInstance.getState() as { refDate?: AnchorString; shelf?: string | null };
      expect(state.refDate).toBeUndefined();
      expect(state.shelf).toBe("B");
    });
  });

  describe("getState", () => {
    it("returns refDate undefined by default", () => {
      const { leafInstance } = build();
      const state = leafInstance.getState() as { refDate?: AnchorString };
      expect(state.refDate).toBeUndefined();
    });

    it("omits refDate from persisted state when the view does not remember the date", async () => {
      const { leafInstance } = build(seedView({ rememberDate: false }));
      await leafInstance.setState({ refDate: "2026-06-01" }, {});
      const state = leafInstance.getState() as { refDate?: AnchorString };
      expect(state.refDate).toBeUndefined();
    });

    it("returns shelf undefined by default", () => {
      const { leafInstance } = build();
      const state = leafInstance.getState() as { shelf?: string | null };
      expect(state.shelf).toBeUndefined();
    });
  });

  describe("getIcon", () => {
    it("returns the view's configured icon", () => {
      const { leafInstance } = build(seedView({ icon: "star" }));
      expect(leafInstance.getIcon()).toBe("star");
    });

    it("falls back to a generic icon when the view has no icon", () => {
      const { leafInstance } = build(seedView({ icon: "" }));
      expect(leafInstance.getIcon()).toBe(FALLBACK_VIEW_ICON);
    });
  });

  describe("rendering", () => {
    it("reports that the view was deleted when the view is None", async () => {
      const host = createFakeHost();
      const events = createNanoEvents<ViewsEvents>();
      const repo = ViewsRepository.fromParts({}, events);
      const c = new Container();
      c.register(InternalPluginToken).useValue(host.plugin);
      c.register(InternalObsidianAppToken).useValue(host.app);
      c.addModule(createLoggerTestingModule().module);
      c.register(ViewsEventsToken).useValue(events);
      c.register(ViewsRepository).useValue(repo);
      c.register(ToolbarItemsService).useClass(ToolbarItemsService);
      c.register(ShelvesRepository).useValue(fakeShelvesRepo());
      c.register(ShelvesEventsToken).useValue(createNanoEvents<ShelvesEvents>());
      c.register(ViewsService).useClass(ViewsService);
      registerFollowDependencies(c);
      const injector = c.resolve(InjectorToken);
      const containerEl = document.createElement("div");
      const leafStub = { containerEl };
      // onOpen/onClose are protected on ItemView; cast to reach them from tests.
      const leaf = new JournalViewLeaf(
        leafStub as unknown as WorkspaceLeaf,
        "missing" as ViewId,
        injector,
      ) as unknown as {
        onOpen(): Promise<void>;
        onClose(): Promise<void>;
      };
      await leaf.onOpen();
      expect(containerEl.textContent).toContain(m.view_deleted_error());
      await leaf.onClose();
    });

    it("reports a block whose key is not registered", async () => {
      const view = seedView({
        blocks: [{ id: "block-id" as BlockInstanceId, key: "missing-block", config: {} }],
      });
      const { leafInstance, containerEl } = build(view);
      const leaf = leafInstance as unknown as { onOpen(): Promise<void>; onClose(): Promise<void> };
      await leaf.onOpen();
      expect(containerEl.textContent).toContain(m.view_block_unknown_error());
      await leaf.onClose();
    });

    it("renders a Calendar-shaped view containing a toolbar (with shelf-selector) + divider", async () => {
      const view = seedView({
        blocks: [
          {
            id: "11111111-1111-1111-1111-111111111111" as BlockInstanceId,
            key: "toolbar",
            config: {
              items: [{ id: "22222222-2222-2222-2222-222222222222", key: "shelf-selector", config: {} }],
            },
          },
          { id: "33333333-3333-3333-3333-333333333333" as BlockInstanceId, key: "divider", config: {} },
        ],
      });
      const host = createFakeHost();
      const events = createNanoEvents<ViewsEvents>();
      const repo = ViewsRepository.fromParts({ [view.id]: view }, events);
      const shelves = ShelvesRepository.fromParts(
        { Personal: { name: "Personal", journals: [], decorations: [] } },
        createNanoEvents<ShelvesEvents>(),
      );
      const c = new Container();
      c.register(InternalPluginToken).useValue(host.plugin);
      c.register(InternalObsidianAppToken).useValue(host.app);
      c.addModule(createLoggerTestingModule().module);
      c.register(ViewsEventsToken).useValue(events);
      c.register(ViewsRepository).useValue(repo);
      c.register(ShelvesRepository).useValue(shelves);
      c.register(ViewBlockDefinitionToken).useValue(toolbarBlock);
      c.register(ViewBlockDefinitionToken).useValue(dividerBlock);
      c.register(ToolbarItemDefinitionToken).useValue(shelfSelectorItem);
      c.register(ToolbarItemsService).useClass(ToolbarItemsService);
      c.register(ShelvesEventsToken).useValue(createNanoEvents<ShelvesEvents>());
      c.register(ViewsService).useClass(ViewsService);
      registerFollowDependencies(c);
      const containerEl = document.createElement("div");
      const leafStub = { containerEl };
      const injector = c.resolve(InjectorToken);
      const leaf = new JournalViewLeaf(leafStub as unknown as WorkspaceLeaf, view.id, injector) as unknown as {
        onOpen(): Promise<void>;
        onClose(): Promise<void>;
      };
      await leaf.onOpen();
      expect(containerEl.querySelector(".journal-view-toolbar")).not.toBeNull();
      expect(containerEl.querySelector(".journal-view-divider")).not.toBeNull();
      // shelf-selector renders "All journals" because shelf is null while a shelf exists
      expect(containerEl.textContent).toContain("All journals");
      await leaf.onClose();
    });

    it("reports a block whose config fails the registered schema", async () => {
      const trivialBlock = defineViewBlock<{ x: number }>({
        key: "trivial-block",
        label: "Trivial",
        schema: v.object({ x: v.number() }),
        defaultConfig: { x: 0 },
        component: { setup: () => noop },
      });
      const view = seedView({
        blocks: [{ id: "block-id" as BlockInstanceId, key: "trivial-block", config: { x: "not-a-number" } }],
      });
      const host = createFakeHost();
      const events = createNanoEvents<ViewsEvents>();
      const repo = ViewsRepository.fromParts({ [view.id]: view }, events);
      const c = new Container();
      c.register(InternalPluginToken).useValue(host.plugin);
      c.register(InternalObsidianAppToken).useValue(host.app);
      c.addModule(createLoggerTestingModule().module);
      c.register(ViewsEventsToken).useValue(events);
      c.register(ViewsRepository).useValue(repo);
      c.register(ViewBlockDefinitionToken).useValue(trivialBlock);
      c.register(ToolbarItemsService).useClass(ToolbarItemsService);
      c.register(ShelvesRepository).useValue(fakeShelvesRepo());
      c.register(ShelvesEventsToken).useValue(createNanoEvents<ShelvesEvents>());
      c.register(ViewsService).useClass(ViewsService);
      registerFollowDependencies(c);
      const containerEl = document.createElement("div");
      const leafStub = { containerEl };
      const injector = c.resolve(InjectorToken);
      const leaf = new JournalViewLeaf(leafStub as unknown as WorkspaceLeaf, view.id, injector) as unknown as {
        onOpen(): Promise<void>;
        onClose(): Promise<void>;
      };
      await leaf.onOpen();
      expect(containerEl.textContent).toContain(m.view_block_config_error());
      await leaf.onClose();
    });
  });

  describe("refDateOrigin", () => {
    it("reports a follow origin when an in-scope journal note opens", async () => {
      const { leaf, leafInstance, probe, activeEntry } = buildFollowingView();
      // Seeded so the view's date sits outside the daily note's own day, independent of the
      // real wall clock — otherwise the Task 3 follow guard would hold on any run where
      // today happens to land on 2026-03-09.
      await leafInstance.setState({ refDate: "2026-01-01" }, {});
      await leaf.onOpen();

      activeEntry.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
      await nextTick();

      expect(probe.context?.refDateOrigin.value).toBe("follow");
      await leaf.onClose();
    });

    it("reports a navigate origin after setRefDate overrides a followed date", async () => {
      const { leaf, leafInstance, probe, activeEntry } = buildFollowingView();
      // Same seeding as above: keeps the initial follow independent of the real wall clock.
      await leafInstance.setState({ refDate: "2026-01-01" }, {});
      await leaf.onOpen();
      activeEntry.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
      await nextTick();

      probe.context?.setRefDate("2026-04-01" as AnchorString);

      expect(probe.context?.refDateOrigin.value).toBe("navigate");
      await leaf.onClose();
    });

    it("leaves the view's date unchanged when the view has follow active date turned off", async () => {
      const { leaf, probe, activeEntry } = buildFollowingView({ followActiveDate: false });
      await leaf.onOpen();
      const before = probe.context?.refDate.value;

      activeEntry.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
      await nextTick();

      expect(probe.context?.refDate.value).toBe(before);
      await leaf.onClose();
    });
  });
});
