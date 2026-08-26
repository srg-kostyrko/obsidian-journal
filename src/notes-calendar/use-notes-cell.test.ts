import { __testing } from "obsidian";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { defineComponent, shallowRef } from "vue";

import { DayPeriod, type AnchorString } from "@/calendar";
import { date } from "@/calendar/testing";
import type { CellStyleRef } from "@/decorations";
import { cellKey } from "@/decorations/engine";
import { buildStyle } from "@/decorations/testing";
import { Flows } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, OpenDateFlow } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { notesCalendarModule } from "./module";
import { useNotesCell, type NotesCellApi } from "./use-notes-cell";

const MODULES = [journalsCoreModule, notesCalendarModule];

const may25 = DayPeriod.containing(date("2026-05-25"));
const dailyPath = "Daily/2026-05-25.md" as VaultPath;

async function bootHarness(): Promise<{
  harness: TestHarness;
  invokeSpy: MockInstance<Flows["invoke"]>;
}> {
  const harness = await testContainer({
    modules: MODULES,
    data: {
      journals: {
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "2026-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      },
    },
  });
  const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue({} as never);
  return { harness, invokeSpy };
}

function resolveApi(
  harness: TestHarness,
  journalNames: () => readonly string[],
  decorations?: ReadonlyMap<string, CellStyleRef> | null,
  primaryOpen?: { enabled: () => boolean; handler: (period: DayPeriod) => void },
): NotesCellApi {
  let captured: NotesCellApi | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useNotesCell({
        journalNames,
        decorations,
        primaryOpen: primaryOpen && {
          enabled: primaryOpen.enabled,
          handler: (period) => primaryOpen.handler(period as DayPeriod),
        },
      });
      return undefined;
    },
    template: "<div />",
  });
  harness.render(Probe);
  if (!captured) throw new Error("probe did not capture the notes-cell api");
  return captured;
}

// The real WorkspaceService drives Obsidian's own Menu, so these assertions read the menu the
// host actually opened. `undefined` and `[]` are different outcomes and must stay distinguishable:
// openPathsMenu returns without showing anything when a period resolved neither a path nor an
// extra item, whereas a shown menu carrying no items would be a bug a `?? []` fallback would hide.
function menuItemTitles(): readonly string[] | undefined {
  return __testing.openMenus.at(-1)?.items.map((item) => item.title);
}

function hoverPreviewPaths(harness: TestHarness): readonly string[] {
  return harness.host.workspace.triggerCalls
    .filter((call) => call.event === "link-hover")
    .map((call) => String(call.arguments_[2]));
}

beforeEach(() => {
  __testing.reset();
});

describe("useNotesCell", () => {
  describe("isActionable", () => {
    it("is true when any in-scope journal covers the period's anchor", async () => {
      const { harness } = await bootHarness();
      const api = resolveApi(harness, () => ["daily"]);

      expect(api.isActionable(may25)).toBe(true);
    });

    it("is false when no journal is in scope", async () => {
      const { harness } = await bootHarness();
      const api = resolveApi(harness, () => []);

      expect(api.isActionable(may25)).toBe(false);
    });

    it("is false when the anchor is before every in-scope journal's timeline start", async () => {
      const { harness } = await bootHarness();
      const api = resolveApi(harness, () => ["daily"]);
      const before = DayPeriod.containing(date("2025-12-31"));

      expect(api.isActionable(before)).toBe(false);
    });
  });

  describe("isActive", () => {
    it("is true when the active entry's journal + anchor match the period", async () => {
      const { harness } = await bootHarness();
      const api = resolveApi(harness, () => ["daily"]);
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "daily", anchor: may25.anchor.toAnchor(), path: dailyPath });
      harness.host.emitFileOpen(harness.host.putFile(dailyPath));

      expect(api.isActive(may25)).toBe(true);
    });

    it("is false when the active entry's journal is not in scope", async () => {
      const { harness } = await bootHarness();
      const api = resolveApi(harness, () => ["daily"]);
      const weeklyPath = "Weekly/2026-05-25.md" as VaultPath;
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "weekly", anchor: may25.anchor.toAnchor(), path: weeklyPath });
      harness.host.emitFileOpen(harness.host.putFile(weeklyPath));

      expect(api.isActive(may25)).toBe(false);
    });

    it("is false when active is null", async () => {
      const { harness } = await bootHarness();
      const api = resolveApi(harness, () => ["daily"]);

      expect(api.isActive(may25)).toBe(false);
    });
  });

  describe("open", () => {
    it("routes Shift+left click to the optional vault-day handler without invoking the journal flow", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const handler = vi.fn();
      const api = resolveApi(harness, () => [], undefined, { enabled: () => true, handler });

      api.open(may25, new MouseEvent("click", { button: 0, shiftKey: true }));

      expect(handler).toHaveBeenCalledWith(may25);
      expect(invokeSpy).not.toHaveBeenCalled();
      expect(api.isActionable(may25)).toBe(true);
    });

    it("restores a plain left click to the original journal action", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const handler = vi.fn();
      const api = resolveApi(harness, () => ["daily"], undefined, { enabled: () => true, handler });

      api.open(may25, new MouseEvent("click", { button: 0 }));

      expect(handler).not.toHaveBeenCalled();
      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ openMode: "active" }));
    });

    it("preserves middle click as the original journal action", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const handler = vi.fn();
      const api = resolveApi(harness, () => ["daily"], undefined, { enabled: () => true, handler });

      api.open(may25, new MouseEvent("auxclick", { button: 1 }));

      expect(handler).not.toHaveBeenCalled();
      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ openMode: "tab" }));
    });

    it("preserves modified left clicks as the original journal action", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const handler = vi.fn();
      const api = resolveApi(harness, () => ["daily"], undefined, { enabled: () => true, handler });

      api.open(may25, new MouseEvent("click", { button: 0, ctrlKey: true }));

      expect(handler).not.toHaveBeenCalled();
      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ openMode: "tab" }));
    });

    it("preserves Shift+Ctrl left click as the original new-tab journal action", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const handler = vi.fn();
      const api = resolveApi(harness, () => ["daily"], undefined, { enabled: () => true, handler });

      api.open(may25, new MouseEvent("click", { button: 0, ctrlKey: true, shiftKey: true }));

      expect(handler).not.toHaveBeenCalled();
      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ openMode: "tab" }));
    });

    it("invokes OpenDateFlow with the period anchor and journal names", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const api = resolveApi(harness, () => ["daily"]);
      const event = new MouseEvent("click");

      api.open(may25, event);

      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
        anchor: may25.anchor.toAnchor(),
        journalNames: ["daily"],
        openMode: "active",
        pickAt: event,
      });
    });

    it("passes openMode 'tab' when ctrl is held", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const api = resolveApi(harness, () => ["daily"]);

      api.open(may25, new MouseEvent("click", { ctrlKey: true }));

      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ openMode: "tab" }));
    });

    it("does not invoke OpenDateFlow when the cell is not actionable", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const api = resolveApi(harness, () => []);

      api.open(may25, new MouseEvent("click"));

      expect(invokeSpy).not.toHaveBeenCalled();
    });
  });

  describe("openContextMenu", () => {
    it("resolves no paths when no entry exists at the period's anchor", async () => {
      const { harness } = await bootHarness();
      const api = resolveApi(harness, () => ["daily"]);

      api.openContextMenu(may25, new MouseEvent("contextmenu"));

      expect(menuItemTitles()).toBeUndefined();
    });

    it("resolves the existing paths across every in-scope journal at the period's anchor", async () => {
      const { harness } = await bootHarness();
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: may25.anchor.toAnchor(), path: dailyPath });
      const secondPath = "Daily2/2026-05-25.md" as VaultPath;
      index.register({ journalName: "secondary", anchor: may25.anchor.toAnchor(), path: secondPath });
      const api = resolveApi(harness, () => ["daily", "secondary"]);

      api.openContextMenu(may25, new MouseEvent("contextmenu"));

      expect(menuItemTitles()).toEqual([dailyPath, secondPath]);
    });

    it("contributes the explain item to the context menu of a decorated cell", async () => {
      const { harness } = await bootHarness();
      const decorations: ReadonlyMap<string, CellStyleRef> = new Map([
        [cellKey(may25.kind, may25.anchor.toAnchor()), shallowRef([buildStyle("background")])],
      ]);
      const api = resolveApi(harness, () => ["daily"], decorations);

      api.openContextMenu(may25, new MouseEvent("contextmenu"));

      expect(menuItemTitles()).toHaveLength(1);
    });

    it("contributes no item to the context menu of an undecorated cell", async () => {
      const { harness } = await bootHarness();
      const decorations = new Map<string, CellStyleRef>();
      const api = resolveApi(harness, () => ["daily"], decorations);

      api.openContextMenu(may25, new MouseEvent("contextmenu"));

      expect(menuItemTitles()).toBeUndefined();
    });
  });

  describe("openPreview", () => {
    it("delegates the modifier-key gate and existing paths to previewFirstPath", async () => {
      const { harness } = await bootHarness();
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: may25.anchor.toAnchor(), path: dailyPath });
      const api = resolveApi(harness, () => ["daily"]);

      api.openPreview(may25, new MouseEvent("mouseenter", { ctrlKey: true }));

      expect(hoverPreviewPaths(harness)).toEqual([dailyPath]);
    });
  });
});
