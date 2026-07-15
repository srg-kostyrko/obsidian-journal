import { cleanup, render } from "@testing-library/vue";
import { createNanoEvents, type Emitter } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, inject as vInject, nextTick, ref, type Ref } from "vue";

import { CalendarDate, DayPeriod, WeekPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, type NotesEvents, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { fakeRepo, fixedJournal } from "@/journals/testing";

import { cellKey, DecorationEngine } from "./engine";
import { buildCondition, buildDecoration, buildStyle } from "./testing";
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
}

function date(s: string): CalendarDate {
  const r = CalendarDate.parse(s);
  if (r.kind === "err") throw new Error(`bad date: ${s}`);
  return r.value;
}

function buildHarness(decorations: JournalConfig["decorations"] = []): Harness {
  const notesEmitter: Emitter<NotesEvents> = createNanoEvents<NotesEvents>();
  const c = new Container();
  c.register(JournalsRepository).useValue(
    fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { decorations }),
    }),
  );
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  const fakeMetadata = new FakeNoteMetadataService();
  c.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  c.register(NotesService).useValue({ events: notesEmitter } as unknown as NotesService);
  c.register(DecorationEngine).useClass(DecorationEngine);
  return { c, notesEmitter, fakeMetadata };
}

function buildWeeklyHarness(weeklyDecorations: JournalConfig["decorations"]): Harness {
  const notesEmitter: Emitter<NotesEvents> = createNanoEvents<NotesEvents>();
  const c = new Container();
  c.register(JournalsRepository).useValue(
    fakeRepo({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }, { decorations: weeklyDecorations }),
    }),
  );
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  const fakeMetadata = new FakeNoteMetadataService();
  c.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  c.register(NotesService).useValue({ events: notesEmitter } as unknown as NotesService);
  c.register(DecorationEngine).useClass(DecorationEngine);
  return { c, notesEmitter, fakeMetadata };
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
        useCellDecorations(
          () => [period],
          () => ["daily"],
        ),
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
        useCellDecorations(
          () => [period],
          () => ["daily"],
          undefined,
          (binding) => binding.decoration === kept,
        ),
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

      const { captured } = mount(c, () => useCellDecorations(periodsRef, () => ["daily"]));
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
        useCellDecorations(
          () => [period],
          () => ["daily"],
        ),
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
        useCellDecorations(
          () => [period],
          () => ["daily"],
        ),
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
        useCellDecorations(
          () => [period],
          () => ["daily"],
        ),
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
        useCellDecorations(
          () => [weekPeriod, ...dayPeriods],
          () => ["daily", "weekly"],
        ),
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
        useCellDecorations(
          () => [period],
          () => ["daily"],
        ),
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

    it("detaches subscriptions on unmount", async () => {
      const { h, period, path } = withHasNote();
      const { captured, unmount } = mount(h.c, () =>
        useCellDecorations(
          () => [period],
          () => ["daily"],
        ),
      );
      await nextTick();
      const slot = captured.value!.get(key(period))!;
      const initial = slot.value;

      unmount();
      expect(() => h.notesEmitter.emit("metadata-changed", path)).not.toThrow();
      expect(slot.value).toBe(initial);
    });
  });
});
