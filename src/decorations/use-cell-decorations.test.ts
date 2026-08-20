import { cleanup, render } from "@testing-library/vue";
import { createNanoEvents, type Emitter } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, inject as vInject, nextTick, reactive, ref, type Ref } from "vue";

import { CalendarDate, DayPeriod, WeekPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { provideInjectorOnApp, type Container } from "@/infrastructure/di";
import {
  NoteMetadataService,
  NoteSizeService,
  NotesService,
  type NotesEvents,
  type VaultPath,
} from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNoteSizeService } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { fakeRepo, fixedJournal } from "@/journals/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { DecorationsStore } from "./decorations-store";
import { cellKey, DecorationEngine } from "./engine";
import { resolveCell } from "./resolve-cell";
import { decorationsSlice } from "./settings/slice";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";
import { CellDecorationMapKey, type CellStyleRef } from "./ui/cell-decoration-map-key";
import { useCellDecorations } from "./use-cell-decorations";

// The cell map is keyed by period kind + anchor; mirror that for lookups.
function key(period: Period): string {
  return cellKey(period.kind, period.anchor.toAnchor());
}

interface Harness {
  c: Container;
  notesEmitter: Emitter<NotesEvents>;
  fakeMetadata: FakeNoteMetadataService;
  size: FakeNoteSizeService;
  store: DecorationsStore;
}

function date(s: string): CalendarDate {
  const r = CalendarDate.parse(s);
  if (r.kind === "err") throw new Error(`bad date: ${s}`);
  return r.value;
}

// Shared setup for the pieces every harness variant needs beyond the journal repository:
// the settings slice backing the vault-wide list, and a "work" shelf to save shelf-owned
// decorations onto.
function buildHarnessFrom(journals: JournalsRepository, notesEmitter: Emitter<NotesEvents>): Harness {
  const { container: c, service } = createSettingsService({ slices: [decorationsSlice] });
  // createSettingsService does not call initialize(), so the slice's default state is never
  // hydrated into #root — set it explicitly or a first read is undefined.
  service.getSlice(decorationsSlice).state = { decorations: [] };
  c.register(JournalsRepository).useValue(journals);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);
  const fakeMetadata = new FakeNoteMetadataService();
  c.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  const size = new FakeNoteSizeService();
  c.register(NoteSizeService).useValue(size as unknown as NoteSizeService);
  c.register(NotesService).useValue({ events: notesEmitter } as unknown as NotesService);
  c.register(DecorationEngine).useClass(DecorationEngine);
  const shelfStorage = reactive<Record<string, ShelfConfig>>({
    work: { name: "work", journals: [], decorations: [] },
  });
  c.register(ShelvesRepository).useValue(ShelvesRepository.fromParts(shelfStorage, createNanoEvents<ShelvesEvents>()));
  c.register(DecorationsStore).useClass(DecorationsStore);
  const store = c.resolve(DecorationsStore);
  return { c, notesEmitter, fakeMetadata, size, store };
}

function buildHarness(decorations: JournalConfig["decorations"] = []): Harness {
  const notesEmitter: Emitter<NotesEvents> = createNanoEvents<NotesEvents>();
  const journals = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }, { decorations }),
  });
  return buildHarnessFrom(journals, notesEmitter);
}

function buildWeeklyHarness(weeklyDecorations: JournalConfig["decorations"]): Harness {
  const notesEmitter: Emitter<NotesEvents> = createNanoEvents<NotesEvents>();
  const journals = fakeRepo({
    daily: fixedJournal("daily", { type: "day" }),
    weekly: fixedJournal("weekly", { type: "week" }, { decorations: weeklyDecorations }),
  });
  return buildHarnessFrom(journals, notesEmitter);
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
  container: Container,
  setup: () => ReadonlyMap<string, CellStyleRef>,
): {
  captured: { value: ReadonlyMap<string, CellStyleRef> | null };
  unmount: () => void;
} {
  const captured = { value: null as ReadonlyMap<string, CellStyleRef> | null };
  const Child = makeChild(captured);
  const Host = makeHost(Child, setup);
  const utilities = render(Host, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
  return { captured, unmount: () => utilities.unmount() };
}

function mountCells(
  container: Container,
  periods: readonly Period[],
  journalNames: readonly string[],
  calendarDecorations?: { shelf: string | null },
): ReadonlyMap<string, CellStyleRef> {
  const { captured } = mount(container, () =>
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

function withHasNote(): { h: Harness; period: DayPeriod; path: VaultPath } {
  const decoration = buildDecoration({
    mode: "or",
    conditions: [buildCondition("has-note")],
    styles: [buildStyle("background")],
  });
  const h = buildHarness([decoration]);
  const period = DayPeriod.containing(date("2026-05-25"));
  const path = "Daily/2026-05-25.md" as VaultPath;
  h.c.resolve(JournalsIndex).register({ journalName: "daily", anchor: period.anchor.toAnchor(), path });
  h.fakeMetadata.setMetadata(path, { title: "2026-05-25", tags: [], properties: {}, tasks: [] });
  return { h, period, path };
}

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  teardown();
  cleanup();
});

describe("useCellDecorations", () => {
  describe("seeding", () => {
    it("seeds a ShallowRef per visible anchor on mount", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })], // Mon
        styles: [buildStyle("background")],
      });
      const { c } = buildHarness([decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const { captured } = mount(c, () =>
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
      const { c } = buildHarness([kept, dropped]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const { captured } = mount(c, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
          filter: (binding) => binding.decoration === kept,
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
      const { c } = buildHarness([decoration]);
      const p1 = DayPeriod.containing(date("2026-05-25"));
      const p2 = DayPeriod.containing(date("2026-05-26"));
      const periodsRef: Ref<DayPeriod[]> = ref([p1]);

      const { captured } = mount(c, () => useCellDecorations({ periods: periodsRef, journalNames: () => ["daily"] }));
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
      const { h, period, path } = withHasNote();
      const { captured } = mount(h.c, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
        }),
      );
      await nextTick();

      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;
      h.notesEmitter.emit("metadata-changed", path);
      await nextTick();
      expect(slot.value).not.toBe(initial);
    });

    it("does not touch the slot when metadata-changed fires for an out-of-scope path", async () => {
      const { h, period } = withHasNote();
      const { captured } = mount(h.c, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
        }),
      );
      await nextTick();

      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;
      h.notesEmitter.emit("metadata-changed", "Other/random.md" as VaultPath);
      await nextTick();
      expect(slot.value).toBe(initial);
    });

    it("updates the affected anchor when entryChanged fires for an in-scope anchor", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("background")],
      });
      const h = buildHarness([decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const { captured } = mount(h.c, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
        }),
      );
      await nextTick();
      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;

      const path = "Daily/2026-05-25.md" as VaultPath;
      h.fakeMetadata.setMetadata(path, { title: "2026-05-25", tags: [], properties: {}, tasks: [] });
      h.c.resolve(JournalsIndex).register({ journalName: "daily", anchor: period.anchor.toAnchor(), path });
      await nextTick();

      expect(slot.value).not.toBe(initial);
    });

    it("decorates a week cell whose anchor collides with a day cell when its entry is added", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("background")],
      });
      const h = buildWeeklyHarness([decoration]);
      const weekPeriod = WeekPeriod.containing(date("2026-06-10"));
      const weekAnchor = weekPeriod.anchor.toAnchor();
      const dayPeriods = [...weekPeriod.days()].map((d) => DayPeriod.containing(d));
      const collidingDay = dayPeriods.find((d) => d.anchor.toAnchor() === weekAnchor);
      expect(collidingDay).toBeDefined();

      const { captured } = mount(h.c, () =>
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
      h.fakeMetadata.setMetadata(path, { title: "2026-W24", tags: [], properties: {}, tasks: [] });
      h.c.resolve(JournalsIndex).register({ journalName: "weekly", anchor: weekAnchor, path });
      await nextTick();

      expect(weekSlot.value).toHaveLength(1);
      // The weekly decoration must not leak onto the day cell that shares the week's anchor.
      expect(daySlot.value).toHaveLength(0);
    });

    it("recomputes a renamed cell on the next resolved when the rename re-keyed it before the cache caught up", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("title", { condition: "ends-with", value: "-match" })],
        styles: [buildStyle("background")],
      });
      const h = buildHarness([decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));
      const anchor = period.anchor.toAnchor();
      const index = h.c.resolve(JournalsIndex);

      const oldPath = "Daily/plain.md" as VaultPath;
      index.register({ journalName: "daily", anchor, path: oldPath });
      h.fakeMetadata.setMetadata(oldPath, { title: "plain", tags: [], properties: {}, tasks: [] });

      const { captured } = mount(h.c, () =>
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
      h.fakeMetadata.setMetadata(newPath, { title: "renamed-match", tags: [], properties: {}, tasks: [] });
      h.notesEmitter.emit("renamed", { from: oldPath, to: newPath });
      h.fakeMetadata.emitResolved();
      await nextTick();

      expect(slot.value).toHaveLength(1);
    });

    it("updates the affected anchor when a note size lands", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("note-size", { condition: "gt", value: 100 })],
        styles: [buildStyle("background")],
      });
      const h = buildHarness([decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));
      const path = "Daily/2026-05-25.md" as VaultPath;
      h.c.resolve(JournalsIndex).register({ journalName: "daily", anchor: period.anchor.toAnchor(), path });

      const { captured } = mount(h.c, () =>
        useCellDecorations({ periods: () => [period], journalNames: () => ["daily"] }),
      );
      await nextTick();

      const slot = captured.value!.get(key(period))!;
      // Absent on first paint by design: the size has not been read yet.
      expect(slot.value).toHaveLength(0);

      h.size.setSize(path, { words: 400, characters: 2200 });
      await nextTick();

      expect(slot.value).toHaveLength(1);
    });

    it("does not touch the slot when a size lands for an out-of-scope path", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("note-size", { condition: "gt", value: 100 })],
        styles: [buildStyle("background")],
      });
      const h = buildHarness([decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));
      h.c.resolve(JournalsIndex).register({
        journalName: "daily",
        anchor: period.anchor.toAnchor(),
        path: "Daily/2026-05-25.md" as VaultPath,
      });

      const { captured } = mount(h.c, () =>
        useCellDecorations({ periods: () => [period], journalNames: () => ["daily"] }),
      );
      await nextTick();

      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;
      h.size.setSize("Other/random.md" as VaultPath, { words: 400, characters: 2200 });
      await nextTick();

      expect(slot.value).toBe(initial);
    });

    it("detaches subscriptions on unmount", async () => {
      const { h, period, path } = withHasNote();
      const { captured, unmount } = mount(h.c, () =>
        useCellDecorations({
          periods: () => [period],
          journalNames: () => ["daily"],
        }),
      );
      await nextTick();
      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;

      unmount();
      expect(() => h.notesEmitter.emit("metadata-changed", path)).not.toThrow();
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
      const { c, store } = buildHarness();
      store.save({ kind: "global" }, [decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(c, [period], [], { shelf: null });
      await nextTick();

      expect(cells.get(key(period))?.value).toEqual(decoration.styles);
    });

    it("ignores a shelf's decorations while another shelf is in scope", async () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { c, store } = buildHarness();
      store.save({ kind: "shelf", shelfName: "work" }, [decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(c, [period], [], { shelf: "personal" });
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
      const { c, store } = buildHarness([journalDecoration]);
      store.save({ kind: "global" }, [
        buildCalendarDecoration({
          mode: "or",
          conditions: [buildCondition("weekday", { weekdays: [1] })],
          styles: [globalStyle],
        }),
      ]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(c, [period], ["daily"], { shelf: null });
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
      const { c, store } = buildHarness([journalDecoration]);
      store.save({ kind: "global" }, [
        buildCalendarDecoration({
          mode: "or",
          conditions: [buildCondition("weekday", { weekdays: [1] })],
          styles: [globalBorder],
        }),
      ]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(c, [period], ["daily"], { shelf: null });
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
      const { c, store } = buildHarness([journalDecoration]);
      store.save({ kind: "shelf", shelfName: "work" }, [
        buildCalendarDecoration({
          mode: "or",
          conditions: [buildCondition("weekday", { weekdays: [1] })],
          styles: [shelfStyle],
        }),
      ]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(c, [period], ["daily"], { shelf: "work" });
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
      const { c, store } = buildHarness();
      store.save({ kind: "global" }, [decoration]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(c, [period], []); // no calendarDecorations option
      await nextTick();

      expect(cells.get(key(period))?.value).toEqual([]);
    });

    it("paints a day cell when a vault-wide decoration is saved while the surface is mounted", async () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { c, store } = buildHarness();
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(c, [period], [], { shelf: null });
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
      const { c, store } = buildHarness();
      store.save({ kind: "shelf", shelfName: "work" }, [
        buildCalendarDecoration({ mode: "or", conditions: [weekdayCondition], styles: [shelfStyle] }),
      ]);
      store.save({ kind: "global" }, [
        buildCalendarDecoration({ mode: "or", conditions: [weekdayCondition], styles: [globalStyle] }),
      ]);
      const period = DayPeriod.containing(date("2026-05-25"));

      const cells = mountCells(c, [period], [], { shelf: "work" });
      await nextTick();

      expect(resolveCell(cells.get(key(period))?.value ?? []).background).toBe("#333333");
    });
  });
});
