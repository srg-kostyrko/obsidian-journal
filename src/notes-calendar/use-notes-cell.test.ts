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
  onSelect?: (date: AnchorString) => void,
): NotesCellApi {
  let captured: NotesCellApi | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useNotesCell({ journalNames, decorations, onSelect });
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

    it("selects an inactive period representative on Shift+primary click without opening", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const onSelect = vi.fn();
      const api = resolveApi(harness, () => [], undefined, onSelect);

      api.open(may25, { shiftKey: true, button: 0 } as MouseEvent);

      expect(onSelect).toHaveBeenCalledWith(may25.representative.toAnchor());
      expect(invokeSpy).not.toHaveBeenCalled();
    });

    it("selects the period representative on Shift+Enter without opening", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const onSelect = vi.fn();
      const api = resolveApi(harness, () => ["daily"], undefined, onSelect);

      api.open(may25, { shiftKey: true, key: "Enter" } as KeyboardEvent);

      expect(onSelect).toHaveBeenCalledWith(may25.representative.toAnchor());
      expect(invokeSpy).not.toHaveBeenCalled();
    });

    it("leaves Shift+Space on the ordinary activation path", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const onSelect = vi.fn();
      const api = resolveApi(harness, () => ["daily"], undefined, onSelect);

      api.open(may25, new KeyboardEvent("keydown", { shiftKey: true, key: " " }));

      expect(onSelect).not.toHaveBeenCalled();
      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, expect.anything());
    });

    it("does not fall through to opening when Shift+primary click has no selection callback", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const api = resolveApi(harness, () => ["daily"]);

      api.open(may25, { shiftKey: true, button: 0 } as MouseEvent);

      expect(invokeSpy).not.toHaveBeenCalled();
    });

    it("does not claim Shift+middle click", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const onSelect = vi.fn();
      const api = resolveApi(harness, () => ["daily"], undefined, onSelect);

      api.open(may25, new MouseEvent("auxclick", { shiftKey: true, button: 1 }));

      expect(onSelect).not.toHaveBeenCalled();
      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ openMode: "tab" }));
    });

    it("does not claim a primary click carrying Shift plus an open-mode modifier", async () => {
      const { harness, invokeSpy } = await bootHarness();
      const onSelect = vi.fn();
      const api = resolveApi(harness, () => ["daily"], undefined, onSelect);

      api.open(may25, new MouseEvent("click", { shiftKey: true, ctrlKey: true, button: 0 }));

      expect(onSelect).not.toHaveBeenCalled();
      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ openMode: "tab" }));
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

    // A single resolved path opens that file's own menu directly rather than the
    // multi-path chooser above — a distinct route in WorkspaceService.openPathsMenu.
    it("opens the file's own menu directly when exactly one path resolves", async () => {
      const { harness } = await bootHarness();
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: may25.anchor.toAnchor(), path: dailyPath });
      harness.host.putFile(dailyPath);
      const api = resolveApi(harness, () => ["daily"]);

      api.openContextMenu(may25, new MouseEvent("contextmenu"));

      expect(harness.host.workspace.triggerCalls).toHaveLength(1);
      expect(harness.host.workspace.triggerCalls[0]?.event).toBe("file-menu");
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
