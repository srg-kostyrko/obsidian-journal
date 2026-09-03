import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import type { AnchorString } from "@/calendar/types";
import { m } from "@/i18n";
import { InjectorToken, type Module } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { notesCalendarModule } from "@/notes-calendar/module";
import type { ShelfConfig } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer, type TestHarness } from "@/testing";

import { FALLBACK_VIEW_ICON, type BlockInstanceId, type View, type ViewId } from "./config";
import { defineViewBlock, type ViewBlockDefinition } from "./define-view-block";
import { viewsCoreModule } from "./module";
import { buildView } from "./testing";
import { ViewBlockDefinitionToken } from "./tokens";
import { useViewContext, type ViewContext } from "./view-context";
import { JournalViewLeaf } from "./view-leaf";

import type { WorkspaceLeaf } from "obsidian";

const noop = () => null;

const VIEW_A = "11111111-1111-4111-8111-111111111111" as ViewId;
const BLOCK_STUB = "22222222-2222-4222-8222-222222222222" as BlockInstanceId;
const DAILY_PATH = "Daily/2026-03-09.md" as VaultPath;
const DAILY_ANCHOR = "2026-03-09" as AnchorString;

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
    label: () => "Probe",
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

// The R6 synthetic-definition shape: a per-test block registered through a module, never a
// hand-built Container. Only tests reading a definition's own schema/component need this —
// `viewsCoreModule` already supplies the real toolbar/divider/shelf-selector definitions.
function testBlocksModule(blocks: readonly ViewBlockDefinition[]): Module {
  return {
    register(c) {
      for (const block of blocks) c.register(ViewBlockDefinitionToken).useValue(block);
    },
  };
}

async function buildLeaf(
  view: View | null,
  options: {
    viewId?: ViewId;
    journals?: Record<string, JournalConfig>;
    shelves?: Record<string, ShelfConfig>;
    modules?: readonly Module[];
  } = {},
): Promise<{ harness: TestHarness; leafInstance: JournalViewLeaf; containerEl: HTMLDivElement }> {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule, notesCalendarModule, ...(options.modules ?? [])],
    data: {
      views: view ? { [view.id]: view } : {},
      journals: options.journals ?? {},
      shelves: options.shelves ?? {},
    },
  });
  const containerEl = document.createElement("div");
  const leafStub = { containerEl } as unknown as WorkspaceLeaf;
  const injector = harness.container.resolve(InjectorToken);
  const viewId = options.viewId ?? view?.id ?? ("missing" as ViewId);
  const leafInstance = new JournalViewLeaf(leafStub, viewId, injector);
  return { harness, leafInstance, containerEl };
}

// Registered after the leaf has already mounted, so this simulates a note opening while the
// view is on screen — not a note already open at boot. Moving this ahead of `leaf.onOpen()`
// would let the immediate follow-watch resolve "follow" at mount and silently weaken the
// "note opens later" scenario these tests exist to prove.
function openDailyNote(harness: TestHarness): void {
  harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: DAILY_ANCHOR, path: DAILY_PATH });
  harness.host.emitFileOpen(harness.host.putFile(DAILY_PATH));
}

async function buildFollowingView(overrides: Partial<View> = {}) {
  const { block, probe } = contextProbeBlock();
  const view = buildView(VIEW_A, {
    blocks: [{ id: BLOCK_STUB, key: "context-probe", config: {} }],
    ...overrides,
  });
  const { harness, leafInstance } = await buildLeaf(view, {
    journals: { daily: fixedJournal("daily", { type: "day" }) },
    modules: [testBlocksModule([block])],
  });
  const leaf = leafInstance as unknown as { onOpen(): Promise<void>; onClose(): Promise<void> };
  return { harness, leaf, leafInstance, probe };
}

describe("JournalViewLeaf", () => {
  describe("setState", () => {
    it("stores refDate from incoming state", async () => {
      const { leafInstance } = await buildLeaf(buildView(VIEW_A, { rememberDate: true }));
      await leafInstance.setState({ refDate: "2026-06-01" }, {});
      const state = leafInstance.getState() as { refDate?: AnchorString };
      expect(state.refDate).toBe("2026-06-01");
    });

    it("calls workspace.requestSaveLayout when state changes", async () => {
      const { leafInstance, harness } = await buildLeaf(buildView(VIEW_A));
      const before = harness.host.workspace.saveLayoutCalls;
      await leafInstance.setState({ refDate: "2026-06-01" }, {});
      expect(harness.host.workspace.saveLayoutCalls).toBe(before + 1);
    });

    it("replaces full state on each call (keys absent from incoming state are dropped)", async () => {
      const { leafInstance } = await buildLeaf(buildView(VIEW_A));
      await leafInstance.setState({ refDate: "2026-06-01", shelf: "A" }, {});
      await leafInstance.setState({ shelf: "B" }, {});
      const state = leafInstance.getState() as { refDate?: AnchorString; shelf?: string | null };
      expect(state.refDate).toBeUndefined();
      expect(state.shelf).toBe("B");
    });
  });

  describe("getState", () => {
    it("returns refDate undefined by default", async () => {
      const { leafInstance } = await buildLeaf(buildView(VIEW_A));
      const state = leafInstance.getState() as { refDate?: AnchorString };
      expect(state.refDate).toBeUndefined();
    });

    it("omits refDate from persisted state when the view does not remember the date", async () => {
      const { leafInstance } = await buildLeaf(buildView(VIEW_A, { rememberDate: false }));
      await leafInstance.setState({ refDate: "2026-06-01" }, {});
      const state = leafInstance.getState() as { refDate?: AnchorString };
      expect(state.refDate).toBeUndefined();
    });

    it("returns shelf undefined by default", async () => {
      const { leafInstance } = await buildLeaf(buildView(VIEW_A));
      const state = leafInstance.getState() as { shelf?: string | null };
      expect(state.shelf).toBeUndefined();
    });
  });

  describe("getIcon", () => {
    it("returns the view's configured icon", async () => {
      const { leafInstance } = await buildLeaf(buildView(VIEW_A, { icon: "star" }));
      expect(leafInstance.getIcon()).toBe("star");
    });

    it("falls back to a generic icon when the view has no icon", async () => {
      const { leafInstance } = await buildLeaf(buildView(VIEW_A, { icon: "" }));
      expect(leafInstance.getIcon()).toBe(FALLBACK_VIEW_ICON);
    });
  });

  describe("rendering", () => {
    it("reports that the view was deleted when the view is None", async () => {
      const { leafInstance, containerEl } = await buildLeaf(null, { viewId: "missing" as ViewId });
      const leaf = leafInstance as unknown as { onOpen(): Promise<void>; onClose(): Promise<void> };
      await leaf.onOpen();
      expect(containerEl.textContent).toContain(m.view_deleted_error());
      await leaf.onClose();
    });

    it("reports a block whose key is not registered", async () => {
      const view = buildView(VIEW_A, {
        blocks: [{ id: BLOCK_STUB, key: "missing-block", config: {} }],
      });
      const { leafInstance, containerEl } = await buildLeaf(view);
      const leaf = leafInstance as unknown as { onOpen(): Promise<void>; onClose(): Promise<void> };
      await leaf.onOpen();
      expect(containerEl.textContent).toContain(m.view_block_unknown_error());
      await leaf.onClose();
    });

    it("renders a Calendar-shaped view containing a toolbar (with shelf-selector) + divider", async () => {
      const view = buildView(VIEW_A, {
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
      // viewsCoreModule already registers the real toolbar/divider/shelf-selector definitions,
      // so this test needs no synthetic block/item module.
      const { leafInstance, containerEl } = await buildLeaf(view, {
        shelves: { Personal: buildShelf("Personal") },
      });
      const leaf = leafInstance as unknown as { onOpen(): Promise<void>; onClose(): Promise<void> };
      await leaf.onOpen();
      expect(containerEl.querySelector(".journal-view-toolbar")).not.toBeNull();
      expect(containerEl.querySelector(".journal-view-divider")).not.toBeNull();
      // shelf-selector renders "All journals" because shelf is null while a shelf exists
      expect(containerEl.textContent).toContain(m.common_label_all_journals());
      await leaf.onClose();
    });

    it("reports a block whose config fails the registered schema", async () => {
      const trivialBlock = defineViewBlock<{ x: number }>({
        key: "trivial-block",
        label: () => "Trivial",
        schema: v.object({ x: v.number() }),
        defaultConfig: { x: 0 },
        component: { setup: () => noop },
      });
      const view = buildView(VIEW_A, {
        blocks: [{ id: BLOCK_STUB, key: "trivial-block", config: { x: "not-a-number" } }],
      });
      const { leafInstance, containerEl } = await buildLeaf(view, { modules: [testBlocksModule([trivialBlock])] });
      const leaf = leafInstance as unknown as { onOpen(): Promise<void>; onClose(): Promise<void> };
      await leaf.onOpen();
      expect(containerEl.textContent).toContain(m.view_block_config_error());
      await leaf.onClose();
    });
  });

  describe("refDate wall clock", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("moves the leaf's ref date when the day changes under an open view", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 2, 9, 23, 0, 0));

      const { block, probe } = contextProbeBlock();
      const view = buildView(VIEW_A, { blocks: [{ id: BLOCK_STUB, key: "context-probe", config: {} }] });
      const { leafInstance } = await buildLeaf(view, { modules: [testBlocksModule([block])] });
      const leaf = leafInstance as unknown as { onOpen(): Promise<void>; onClose(): Promise<void> };
      // try/finally so a failed assertion still unmounts the view and releases the shared
      // useToday() instance, rather than leaking it armed under a stopped fake clock into
      // whichever test runs next.
      try {
        await leaf.onOpen();

        expect(probe.context?.refDate.value).toBe("2026-03-09");

        vi.setSystemTime(new Date(2026, 2, 10, 0, 0, 1));
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        await nextTick();

        expect(probe.context?.refDate.value).toBe("2026-03-10");
      } finally {
        await leaf.onClose();
      }
    });
  });

  describe("refDateOrigin", () => {
    it("reports a follow origin when an in-scope journal note opens", async () => {
      const { harness, leaf, leafInstance, probe } = await buildFollowingView();
      // Seeded so the view's date sits outside the daily note's own day, independent of the
      // real wall clock — otherwise the follow guard would hold on any run where
      // today happens to land on 2026-03-09.
      await leafInstance.setState({ refDate: "2026-01-01" }, {});
      await leaf.onOpen();

      openDailyNote(harness);
      await nextTick();

      expect(probe.context?.refDateOrigin.value).toBe("follow");
      await leaf.onClose();
    });

    it("reports a navigate origin after setRefDate overrides a followed date", async () => {
      const { harness, leaf, leafInstance, probe } = await buildFollowingView();
      // Same seeding as above: keeps the initial follow independent of the real wall clock.
      await leafInstance.setState({ refDate: "2026-01-01" }, {});
      await leaf.onOpen();
      openDailyNote(harness);
      await nextTick();

      probe.context?.setRefDate("2026-04-01" as AnchorString);

      expect(probe.context?.refDateOrigin.value).toBe("navigate");
      await leaf.onClose();
    });

    it("reports a select origin after selectRefDate overrides a followed date", async () => {
      const { harness, leaf, leafInstance, probe } = await buildFollowingView();
      // Same seeding as above: keeps the initial follow independent of the real wall clock.
      await leafInstance.setState({ refDate: "2026-01-01" }, {});
      await leaf.onOpen();
      openDailyNote(harness);
      await nextTick();

      probe.context?.selectRefDate("2026-04-01" as AnchorString);

      expect(probe.context?.refDate.value).toBe("2026-04-01");
      expect(probe.context?.refDateOrigin.value).toBe("select");
      await leaf.onClose();
    });

    it("reports a navigate origin after setRefDate overrides a selected date", async () => {
      const { leaf, leafInstance, probe } = await buildFollowingView();
      await leafInstance.setState({ refDate: "2026-01-01" }, {});
      await leaf.onOpen();

      probe.context?.selectRefDate("2026-04-01" as AnchorString);
      probe.context?.setRefDate("2026-04-01" as AnchorString);

      expect(probe.context?.refDateOrigin.value).toBe("navigate");
      await leaf.onClose();
    });

    it("leaves the view's date unchanged when the view has follow active date turned off", async () => {
      const { harness, leaf, probe } = await buildFollowingView({ followActiveDate: false });
      await leaf.onOpen();
      const before = probe.context?.refDate.value;

      openDailyNote(harness);
      await nextTick();

      expect(probe.context?.refDate.value).toBe(before);
      await leaf.onClose();
    });
  });

  describe("followActiveDate", () => {
    it("exposes true when the view's follow-active-date setting is on", async () => {
      const { leaf, probe } = await buildFollowingView({ followActiveDate: true });
      await leaf.onOpen();

      expect(probe.context?.followActiveDate.value).toBe(true);
      await leaf.onClose();
    });

    it("exposes false when the view's follow-active-date setting is off", async () => {
      const { leaf, probe } = await buildFollowingView({ followActiveDate: false });
      await leaf.onOpen();

      expect(probe.context?.followActiveDate.value).toBe(false);
      await leaf.onClose();
    });
  });
});
