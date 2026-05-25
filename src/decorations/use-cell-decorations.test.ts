import { cleanup, render } from "@testing-library/vue";
import { createNanoEvents, type Emitter } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, inject as vInject, nextTick, ref, type Ref } from "vue";

import { CalendarDate, DayPeriod } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, type NotesEvents, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { fakeRepo, fixedJournal } from "@/journals/testing";

import { DecorationEngine } from "./engine";
import { buildCondition, buildDecoration, buildStyle } from "./testing";
import { CellDecorationMapKey, type CellStyleRef } from "./ui/cell-decoration-map-key";
import { useCellDecorations } from "./use-cell-decorations";

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

function makeChild(captured: { value: ReadonlyMap<AnchorString, CellStyleRef> | null }) {
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
  setup: () => ReadonlyMap<AnchorString, CellStyleRef>,
): {
  captured: { value: ReadonlyMap<AnchorString, CellStyleRef> | null };
  unmount: () => void;
} {
  const captured = { value: null as ReadonlyMap<AnchorString, CellStyleRef> | null };
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

      const slot = captured.value!.get(period.anchor.toAnchor());
      expect(slot).toBeDefined();
      expect(slot!.value).toHaveLength(1);
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
      expect(captured.value!.has(p1.anchor.toAnchor())).toBe(true);
      expect(captured.value!.has(p2.anchor.toAnchor())).toBe(false);

      periodsRef.value = [p2];
      await nextTick();
      expect(captured.value!.has(p1.anchor.toAnchor())).toBe(false);
      expect(captured.value!.has(p2.anchor.toAnchor())).toBe(true);
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

      const slot = captured.value!.get(period.anchor.toAnchor())!;
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

      const slot = captured.value!.get(period.anchor.toAnchor())!;
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
      const slot = captured.value!.get(period.anchor.toAnchor())!;
      const initial = slot.value;

      const path = "Daily/2026-05-25.md" as VaultPath;
      h.fakeMetadata.setMetadata(path, { title: "2026-05-25", tags: [], properties: {}, tasks: [] });
      h.c.resolve(JournalsIndex).register({ journalName: "daily", anchor: period.anchor.toAnchor(), path });
      await nextTick();

      expect(slot.value).not.toBe(initial);
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
      const slot = captured.value!.get(period.anchor.toAnchor())!;
      const initial = slot.value;

      unmount();
      expect(() => h.notesEmitter.emit("metadata-changed", path)).not.toThrow();
      expect(slot.value).toBe(initial);
    });
  });
});
