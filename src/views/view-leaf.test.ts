import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar/types";
import { Container, InjectorToken } from "@/infrastructure/di";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
import { ShelvesRepository } from "@/shelves";
import type { ShelvesEvents } from "@/shelves";

import { dividerBlock } from "./blocks/divider/divider-block";
import { toolbarBlock } from "./blocks/toolbar/toolbar-block";
import { defineViewBlock } from "./define-view-block";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ToolbarItemDefinitionToken, ViewBlockDefinitionToken, ViewsEventsToken, type ViewsEvents } from "./tokens";
import { shelfSelectorItem } from "./toolbar-items/shelf-selector/shelf-selector-item";
import { JournalViewLeaf } from "./view-leaf";

import type { BlockInstanceId, View, ViewId } from "./config";
import type { WorkspaceLeaf } from "obsidian";

const noop = () => null;

function seedView(overrides: Partial<View> = {}): View {
  return {
    id: "abc" as ViewId,
    name: "Calendar",
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    leaf: "right",
    blocks: [],
    ...overrides,
  };
}

function build(view: View = seedView()) {
  const host = createFakeHost();
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts({ [view.id]: view }, events);
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.addModule(createLoggerTestingModule().module);
  c.register(ViewsEventsToken).useValue(events);
  c.register(ViewsRepository).useValue(repo);
  c.register(ViewsService).useClass(ViewsService);
  const containerEl = document.createElement("div");
  const leafStub = { containerEl };
  const injector = c.resolve(InjectorToken);
  return {
    leafInstance: new JournalViewLeaf(leafStub as unknown as WorkspaceLeaf, view.id, injector),
    host,
    containerEl,
    injector,
    c,
  };
}

describe("JournalViewLeaf", () => {
  describe("setState", () => {
    it("stores refDate from incoming state", async () => {
      const { leafInstance } = build();
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

    it("returns shelf undefined by default", () => {
      const { leafInstance } = build();
      const state = leafInstance.getState() as { shelf?: string | null };
      expect(state.shelf).toBeUndefined();
    });
  });

  describe("rendering", () => {
    it("renders the View was deleted placeholder when the view is None", async () => {
      const host = createFakeHost();
      const events = createNanoEvents<ViewsEvents>();
      const repo = ViewsRepository.fromParts({}, events);
      const c = new Container();
      c.register(InternalPluginToken).useValue(host.plugin);
      c.register(InternalObsidianAppToken).useValue(host.app);
      c.addModule(createLoggerTestingModule().module);
      c.register(ViewsEventsToken).useValue(events);
      c.register(ViewsRepository).useValue(repo);
      c.register(ViewsService).useClass(ViewsService);
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
      expect(containerEl.textContent).toContain("View was deleted");
      await leaf.onClose();
    });

    it("silently skips a block whose key is not registered", async () => {
      const view = seedView({
        blocks: [{ id: "block-id" as BlockInstanceId, key: "missing-block", config: {} }],
      });
      const { leafInstance, containerEl } = build(view);
      const leaf = leafInstance as unknown as { onOpen(): Promise<void>; onClose(): Promise<void> };
      await leaf.onOpen();
      expect(containerEl.innerHTML).not.toContain("missing-block");
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
      const shelves = ShelvesRepository.fromParts({}, createNanoEvents<ShelvesEvents>());
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
      c.register(ViewsService).useClass(ViewsService);
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
      // shelf-selector renders "All journals" because shelf is null and there are no shelves
      expect(containerEl.textContent).toContain("All journals");
      await leaf.onClose();
    });

    it("silently skips a block whose config fails the registered schema", async () => {
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
      c.register(ViewsService).useClass(ViewsService);
      const containerEl = document.createElement("div");
      const leafStub = { containerEl };
      const injector = c.resolve(InjectorToken);
      const leaf = new JournalViewLeaf(leafStub as unknown as WorkspaceLeaf, view.id, injector) as unknown as {
        onOpen(): Promise<void>;
        onClose(): Promise<void>;
      };
      await leaf.onOpen();
      // journal-view-root is rendered but no block child node should appear
      expect(containerEl.querySelector(".journal-view-root")).not.toBeNull();
      expect(containerEl.querySelector(".journal-view-root")!.children).toHaveLength(0);
      await leaf.onClose();
    });
  });
});
