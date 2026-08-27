import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, inject as vInject, nextTick, ref, type Ref } from "vue";

import { DayPeriod, WeekPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { date } from "@/calendar/testing";
import { NoteMetadataService, NoteSizeService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteSizeService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { DecorationsStore } from "./decorations-store";
import { cellKey } from "./engine";
import { decorationsModule } from "./module";
import { resolveCell } from "./resolve-cell";
import { decorationsSettingsCoreModule } from "./settings/module";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";
import { CellDecorationMapKey, CellPaddingKey, type CellStyleRef } from "./ui/cell-decoration-map-key";
import { useCellDecorations } from "./use-cell-decorations";

// The cell map is keyed by period kind + anchor; mirror that for lookups.
function key(period: Period): string {
  return cellKey(period.kind, period.anchor.toAnchor());
}

interface DecorationsHarness {
  harness: TestHarness;
  size: FakeNoteSizeService;
  store: DecorationsStore;
}

// Shared setup for the pieces every harness variant needs beyond the journal configs:
// the settings slice backing the vault-wide list, and a "work" shelf to save shelf-owned
// decorations onto — DecorationsStore.save({ kind: "shelf" }) writes through
// ShelvesRepository.update, which is a no-op for a shelf that does not exist, so a
// shelf-scoped test would otherwise assert an empty cell for the wrong reason.
async function buildHarnessFrom(journals: Record<string, JournalConfig>): Promise<DecorationsHarness> {
  const size = new FakeNoteSizeService();
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule],
    data: { journals, shelves: { work: buildShelf("work") }, decorations: { decorations: [] } },
    overrides: [overrideWith(NoteSizeService, size as unknown as NoteSizeService)],
  });
  return { harness, size, store: harness.resolve(DecorationsStore) };
}

function buildHarness(decorations: JournalConfig["decorations"] = []): Promise<DecorationsHarness> {
  return buildHarnessFrom({ daily: fixedJournal("daily", { type: "day" }, { decorations }) });
}

function buildWeeklyHarness(weeklyDecorations: JournalConfig["decorations"]): Promise<DecorationsHarness> {
  return buildHarnessFrom({
    daily: fixedJournal("daily", { type: "day" }),
    weekly: fixedJournal("weekly", { type: "week" }, { decorations: weeklyDecorations }),
  });
}

function makeChild(captured: { value: ReadonlyMap<string, CellStyleRef> | null }) {
  return defineComponent({
    template: "<div />",
    setup() {
      captured.value = vInject(CellDecorationMapKey)!;
    },
  });
}

function makeHost(Child: ReturnType<typeof makeChild>, setup: () => unknown) {
  const renderChild = () => h(Child);
  return defineComponent({
    setup() {
      setup();
      return renderChild;
    },
  });
}

function mount(
  harness: TestHarness,
  setup: () => ReadonlyMap<string, CellStyleRef>,
): {
  captured: { value: ReadonlyMap<string, CellStyleRef> | null };
  unmount: () => void;
} {
  const captured = { value: null as ReadonlyMap<string, CellStyleRef> | null };
  const Child = makeChild(captured);
  const Host = makeHost(Child, setup);
  const utilities = harness.render(Host);
  return { captured, unmount: () => utilities.unmount() };
}

function mountCells(
  harness: TestHarness,
  periods: readonly Period[],
  journalNames: readonly string[],
  calendarDecorations?: { shelf: string | null },
): ReadonlyMap<string, CellStyleRef> {
  const { captured } = mount(harness, () =>
    useCellDecorations({
      periods: () => periods,
      journalNames: () => journalNames,
      calendarDecorations: calendarDecorations && { shelf: () => calendarDecorations.shelf },
    }),
  );
  const cells = captured.value;
  if (!cells) throw new Error("cell map was not provided");
  return cells;
}

function mountPadding(harness: TestHarness, periods: readonly Period[], journalNames: readonly string[]): Ref<string> {
  const captured = { value: null as Ref<string> | null };
  const Child = defineComponent({
    template: "<div />",
    setup() {
      captured.value = vInject(CellPaddingKey)!;
    },
  });
  const renderChild = () => h(Child);
  const Host = defineComponent({
    setup() {
      useCellDecorations({ periods: () => periods, journalNames: () => journalNames });
      return renderChild;
    },
  });
  harness.render(Host);
  const padding = captured.value;
  if (!padding) throw new Error("padding was not provided");
  return padding;
}

async function withHasNote(): Promise<{ harness: TestHarness; period: DayPeriod; path: VaultPath }> {
  const decoration = buildDecoration({
    mode: "or",
    conditions: [buildCondition("has-note")],
    styles: [buildStyle("background")],
  });
  const { harness } = await buildHarness([decoration]);
  const period = DayPeriod.containing(date("2026-05-25"));
  const path = "Daily/2026-05-25.md" as VaultPath;
  harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: period.anchor.toAnchor(), path });
  // has-note reads NoteMetadataService.get, which needs the file present in the vault.
  harness.host.putFile(path);
  return { harness, period, path };
}

describe("useCellDecorations", () => {
  describe("seeding", () => {
    it("seeds a ShallowRef per visible anchor on mount", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })], // Mon
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness([decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const { captured } = mount(harness, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
        }),
      );
      await nextTick();

      const slot = captured.value!.get(key(period));
      expect(slot).toBeDefined();
      expect(slot!.value).toHaveLength(1);
    });

    it("gathers only decorations accepted by the filter", async () => {
      const kept = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })], // Mon
        styles: [buildStyle("background")],
      });
      const dropped = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("corner")],
      });
      const { harness } = await buildHarness([kept, dropped]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const { captured } = mount(harness, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
          // A seeded journal's decorations reach the binding as re-parsed copies, so the filter
          // names `kept` by its position in the journal's list rather than by identity.
          filter: (binding) => binding.index === 0,
        }),
      );
      await nextTick();

      const slot = captured.value!.get(key(period));
      expect(slot!.value.map((style) => style.type)).toEqual(["background"]);
    });

    it("re-seeds when the periods input changes", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness([decoration]);
      const p1 = DayPeriod.containing(date("2026-05-25"));
      const p2 = DayPeriod.containing(date("2026-05-26"));
      const periodsRef: Ref<DayPeriod[]> = ref([p1]);

      const { captured } = mount(harness, () =>
        useCellDecorations({ periods: periodsRef, journalNames: () => ["daily"] }),
      );
      await nextTick();
      expect(captured.value!.has(key(p1))).toBe(true);
      expect(captured.value!.has(key(p2))).toBe(false);

      periodsRef.value = [p2];
      await nextTick();
      expect(captured.value!.has(key(p1))).toBe(false);
      expect(captured.value!.has(key(p2))).toBe(true);
    });
  });

  describe("event handling", () => {
    it("updates the affected anchor when metadata-changed fires for an in-scope path", async () => {
      const { harness, period, path } = await withHasNote();
      const { captured } = mount(harness, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
        }),
      );
      await nextTick();

      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;
      harness.host.emitMetadata(path);
      await nextTick();
      expect(slot.value).not.toBe(initial);
    });

    it("does not touch the slot when metadata-changed fires for an out-of-scope path", async () => {
      const { harness, period } = await withHasNote();
      const { captured } = mount(harness, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
        }),
      );
      await nextTick();

      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;
      // The file has to exist: metadataCache "changed" carries the TFile, and NotesService drops
      // the event when there is none — without it the composable's handler never runs at all.
      const outOfScope = "Other/random.md" as VaultPath;
      harness.host.putFile(outOfScope);
      harness.host.emitMetadata(outOfScope);
      await nextTick();
      expect(slot.value).toBe(initial);
    });

    it("updates the affected anchor when entryChanged fires for an in-scope anchor", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness([decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const { captured } = mount(harness, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
        }),
      );
      await nextTick();
      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;

      const path = "Daily/2026-05-25.md" as VaultPath;
      harness.host.putFile(path);
      harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: period.anchor.toAnchor(), path });
      await nextTick();

      expect(slot.value).not.toBe(initial);
    });

    it("decorates a week cell whose anchor collides with a day cell when its entry is added", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildWeeklyHarness([decoration]);
      const weekPeriod = WeekPeriod.containing(date("2026-06-10"));
      const weekAnchor = weekPeriod.anchor.toAnchor();
      const dayPeriods = [...weekPeriod.days()].map((d) => DayPeriod.containing(d));
      const collidingDay = dayPeriods.find((d) => d.anchor.toAnchor() === weekAnchor);
      expect(collidingDay).toBeDefined();

      const { captured } = mount(harness, () =>
        useCellDecorations({
          periods: () => [weekPeriod, ...dayPeriods],
          journalNames: () => ["daily", "weekly"],
        }),
      );
      await nextTick();
      const weekSlot = captured.value!.get(cellKey("week", weekAnchor))!;
      const daySlot = captured.value!.get(key(collidingDay!))!;
      expect(weekSlot.value).toHaveLength(0);
      expect(daySlot.value).toHaveLength(0);

      const path = "Weekly/2026-W24.md" as VaultPath;
      harness.host.putFile(path);
      harness.resolve(JournalsIndex).register({ journalName: "weekly", anchor: weekAnchor, path });
      await nextTick();

      expect(weekSlot.value).toHaveLength(1);
      // The weekly decoration must not leak onto the day cell that shares the week's anchor.
      expect(daySlot.value).toHaveLength(0);
    });

    it("routes a metadata-changed repaint on the weekly note to the week cell despite the anchor collision", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildWeeklyHarness([decoration]);
      const weekPeriod = WeekPeriod.containing(date("2026-06-10"));
      const weekAnchor = weekPeriod.anchor.toAnchor();
      const dayPeriods = [...weekPeriod.days()].map((d) => DayPeriod.containing(d));
      const collidingDay = dayPeriods.find((d) => d.anchor.toAnchor() === weekAnchor);
      expect(collidingDay).toBeDefined();

      const weeklyPath = "Weekly/2026-W24.md" as VaultPath;
      // Registered before mount, so the initial scope build (not the entryChanged handler) is
      // what maps this path back to a cell key.
      harness.resolve(JournalsIndex).register({ journalName: "weekly", anchor: weekAnchor, path: weeklyPath });

      const { captured } = mount(harness, () =>
        useCellDecorations({
          periods: () => [weekPeriod, ...dayPeriods],
          journalNames: () => ["daily", "weekly"],
        }),
      );
      await nextTick();
      const weekSlot = captured.value!.get(cellKey("week", weekAnchor))!;
      const daySlot = captured.value!.get(key(collidingDay!))!;
      expect(weekSlot.value).toHaveLength(0);
      expect(daySlot.value).toHaveLength(0);

      harness.host.putFile(weeklyPath);
      harness.host.emitMetadata(weeklyPath);
      await nextTick();

      expect(weekSlot.value).toHaveLength(1);
      expect(daySlot.value).toHaveLength(0);
    });

    it("recomputes a renamed cell on the next resolved when the rename re-keyed it before the cache caught up", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("title", { condition: "ends-with", value: "-match" })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness([decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));
      const anchor = period.anchor.toAnchor();
      const index = harness.resolve(JournalsIndex);

      const oldPath = "Daily/plain.md" as VaultPath;
      index.register({ journalName: "daily", anchor, path: oldPath });
      // The title a condition reads is the file's basename, so the path carries it.
      harness.host.putFile(oldPath);

      // createFakeHost has no metadataCache "resolved" emitter, so the composable's own
      // subscription is captured here and driven by hand once the cache has caught up.
      const resolvedBatches: (() => void)[] = [];
      vi.spyOn(harness.resolve(NoteMetadataService), "onResolved").mockImplementation((callback) => {
        resolvedBatches.push(callback);
        return () => void resolvedBatches.splice(resolvedBatches.indexOf(callback), 1);
      });

      const { captured } = mount(harness, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
        }),
      );
      await nextTick();
      const slot = captured.value!.get(key(period))!;
      expect(slot.value).toHaveLength(0);

      // The rename re-keys the entry before the new path's metadata exists, so the
      // synchronous entryChanged re-eval reads nothing and the slot stays empty.
      const newPath = "Daily/renamed-match.md" as VaultPath;
      index.transferPath(oldPath, newPath);
      await nextTick();
      expect(slot.value).toHaveLength(0);

      // Cache catches up, then metadataCache "resolved" lands after the rename event.
      const renamed = harness.host.putFile(newPath);
      harness.host.emitVault("rename", renamed, oldPath);
      for (const batch of resolvedBatches.splice(0)) batch();
      await nextTick();

      expect(slot.value).toHaveLength(1);
    });

    it("updates the affected anchor when a note size lands", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("note-size", { condition: "gt", value: 100 })],
        styles: [buildStyle("background")],
      });
      const { harness, size } = await buildHarness([decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));
      const path = "Daily/2026-05-25.md" as VaultPath;
      harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: period.anchor.toAnchor(), path });

      const { captured } = mount(harness, () =>
        useCellDecorations({ periods: () => [period], journalNames: () => ["daily"] }),
      );
      await nextTick();

      const slot = captured.value!.get(key(period))!;
      // Absent on first paint by design: the size has not been read yet.
      expect(slot.value).toHaveLength(0);

      size.setSize(path, { words: 400, characters: 2200 });
      await nextTick();

      expect(slot.value).toHaveLength(1);
    });

    it("does not touch the slot when a size lands for an out-of-scope path", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("note-size", { condition: "gt", value: 100 })],
        styles: [buildStyle("background")],
      });
      const { harness, size } = await buildHarness([decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));
      harness.resolve(JournalsIndex).register({
        journalName: "daily",
        anchor: period.anchor.toAnchor(),
        path: "Daily/2026-05-25.md" as VaultPath,
      });

      const { captured } = mount(harness, () =>
        useCellDecorations({ periods: () => [period], journalNames: () => ["daily"] }),
      );
      await nextTick();

      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;
      size.setSize("Other/random.md" as VaultPath, { words: 400, characters: 2200 });
      await nextTick();

      expect(slot.value).toBe(initial);
    });

    it("detaches subscriptions on unmount", async () => {
      const { harness, period, path } = await withHasNote();
      const { captured, unmount } = mount(harness, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
        }),
      );
      await nextTick();
      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;

      unmount();
      expect(() => harness.host.emitMetadata(path)).not.toThrow();
      expect(slot.value).toBe(initial);
    });
  });

  describe("calendar decorations", () => {
    it("paints a day cell from a vault-wide decoration", async () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness, store } = await buildHarness();
      store.save({ kind: "global" }, [decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(harness, [period], [], { shelf: null });
      await nextTick();

      expect(cells.get(key(period))?.value).toEqual(decoration.styles);
    });

    it("ignores a shelf's decorations while another shelf is in scope", async () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness, store } = await buildHarness();
      store.save({ kind: "shelf", shelfName: "work" }, [decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(harness, [period], [], { shelf: "personal" });
      await nextTick();

      expect(cells.get(key(period))?.value).toEqual([]);
    });

    it("resolves a journal's background over a vault-wide decoration's", async () => {
      const journalStyle = buildStyle("background", { color: { type: "custom", color: "#111111" } });
      const globalStyle = buildStyle("background", { color: { type: "custom", color: "#222222" } });
      const journalDecoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [journalStyle],
      });
      const { harness, store } = await buildHarness([journalDecoration]);
      store.save({ kind: "global" }, [
        buildCalendarDecoration({
          mode: "or",
          conditions: [buildCondition("weekday", { weekdays: [1] })],
          styles: [globalStyle],
        }),
      ]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(harness, [period], ["daily"], { shelf: null });
      await nextTick();

      const styles = cells.get(key(period))?.value ?? [];
      expect(styles).toHaveLength(2);
      expect(resolveCell(styles).background).toBe("#111111");
    });

    it("resolves a journal's border over a vault-wide decoration's", async () => {
      const journalBorder = buildStyle("border", {
        border: "uniform",
        left: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#111111" } },
      });
      const globalBorder = buildStyle("border", {
        border: "uniform",
        left: { show: true, width: 2, style: "solid", color: { type: "custom", color: "#222222" } },
      });
      const journalDecoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [journalBorder],
      });
      const { harness, store } = await buildHarness([journalDecoration]);
      store.save({ kind: "global" }, [
        buildCalendarDecoration({
          mode: "or",
          conditions: [buildCondition("weekday", { weekdays: [1] })],
          styles: [globalBorder],
        }),
      ]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(harness, [period], ["daily"], { shelf: null });
      await nextTick();

      const styles = cells.get(key(period))?.value ?? [];
      expect(styles).toHaveLength(2);
      expect(resolveCell(styles).border.top).toBe("2px solid #111111");
    });

    it("resolves a journal's background over a shelf's", async () => {
      const journalStyle = buildStyle("background", { color: { type: "custom", color: "#555555" } });
      const shelfStyle = buildStyle("background", { color: { type: "custom", color: "#666666" } });
      const journalDecoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [journalStyle],
      });
      const { harness, store } = await buildHarness([journalDecoration]);
      store.save({ kind: "shelf", shelfName: "work" }, [
        buildCalendarDecoration({
          mode: "or",
          conditions: [buildCondition("weekday", { weekdays: [1] })],
          styles: [shelfStyle],
        }),
      ]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(harness, [period], ["daily"], { shelf: "work" });
      await nextTick();

      const styles = cells.get(key(period))?.value ?? [];
      expect(styles).toHaveLength(2);
      expect(resolveCell(styles).background).toBe("#555555");
    });

    it("leaves a day cell untouched when the surface does not opt in", async () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness, store } = await buildHarness();
      store.save({ kind: "global" }, [decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(harness, [period], []); // no calendarDecorations option
      await nextTick();

      expect(cells.get(key(period))?.value).toEqual([]);
    });

    it("paints a day cell when a vault-wide decoration is saved while the surface is mounted", async () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness, store } = await buildHarness();
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(harness, [period], [], { shelf: null });
      await nextTick();
      expect(cells.get(key(period))?.value).toEqual([]);

      store.save({ kind: "global" }, [decoration]);
      await nextTick();

      expect(cells.get(key(period))?.value).toEqual(decoration.styles);
    });

    it("resolves a shelf's background over a vault-wide decoration's", async () => {
      const shelfStyle = buildStyle("background", { color: { type: "custom", color: "#333333" } });
      const globalStyle = buildStyle("background", { color: { type: "custom", color: "#444444" } });
      const weekdayCondition = buildCondition("weekday", { weekdays: [1] });
      const { harness, store } = await buildHarness();
      store.save({ kind: "shelf", shelfName: "work" }, [
        buildCalendarDecoration({ mode: "or", conditions: [weekdayCondition], styles: [shelfStyle] }),
      ]);
      store.save({ kind: "global" }, [
        buildCalendarDecoration({ mode: "or", conditions: [weekdayCondition], styles: [globalStyle] }),
      ]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(harness, [period], [], { shelf: "work" });
      await nextTick();

      expect(resolveCell(cells.get(key(period))?.value ?? []).background).toBe("#333333");
    });
  });
  describe("shared padding", () => {
    it("reserves the same padding whether or not a decoration matches a visible cell", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })], // Mon
        styles: [buildStyle("shape", { placement_x: "right", placement_y: "middle", size: 0.5 })],
      });
      const { harness } = await buildHarness([decoration]);

      const matching = mountPadding(harness, [DayPeriod.containing(date("2026-05-25"))], ["daily"]); // Mon
      const nonMatching = mountPadding(harness, [DayPeriod.containing(date("2026-05-26"))], ["daily"]); // Tue
      await nextTick();

      expect(matching.value).toBe("max(0.1em, 2px) max(0.6em, 2px)");
      expect(nonMatching.value).toBe(matching.value);
    });
  });
});
