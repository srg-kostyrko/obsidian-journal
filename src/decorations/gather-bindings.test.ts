import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { JournalsRepository } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { fakeRepo, fixedJournal } from "@/journals/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { DecorationsStore } from "./decorations-store";
import { gatherBindings } from "./gather-bindings";
import { decorationsSlice } from "./settings/slice";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";

function build(journalDecorations: JournalConfig["decorations"] = []) {
  const { container: c, service } = createSettingsService({ slices: [decorationsSlice] });
  service.getSlice(decorationsSlice).state = { decorations: [] };
  const journals = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { decorations: journalDecorations }) });
  c.register(JournalsRepository).useValue(journals);
  const shelfStorage = reactive<Record<string, ShelfConfig>>({
    work: { name: "work", journals: [], decorations: [] },
    home: { name: "home", journals: [], decorations: [] },
  });
  c.register(ShelvesRepository).useValue(ShelvesRepository.fromParts(shelfStorage, createNanoEvents<ShelvesEvents>()));
  c.register(DecorationsStore).useClass(DecorationsStore);
  return { journals, store: c.resolve(DecorationsStore) };
}

const weekday = () => buildCondition("weekday", { weekdays: [1] });

describe("gatherBindings", () => {
  it("orders vault-wide bindings before journal bindings", () => {
    const { journals, store } = build([
      buildDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);
    store.save({ kind: "global" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: ["daily"], shelf: null, includeCalendar: true });

    expect(bindings.map((b) => b.kind)).toEqual(["calendar", "journal"]);
  });

  it("orders shelf bindings before journal bindings", () => {
    const { journals, store } = build([
      buildDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);
    store.save({ kind: "shelf", shelfName: "work" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: ["daily"], shelf: "work", includeCalendar: true });

    expect(bindings.map((b) => b.kind)).toEqual(["calendar", "journal"]);
  });

  it("labels a vault-wide binding with the global owner", () => {
    const { journals, store } = build();
    store.save({ kind: "global" }, [buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);

    const [binding] = gatherBindings(journals, store, { journalNames: [], shelf: null, includeCalendar: true });

    expect(binding?.kind === "calendar" ? binding.owner : null).toEqual({ kind: "global" });
  });

  it("labels a shelf binding with its shelf owner", () => {
    const { journals, store } = build();
    store.save({ kind: "shelf", shelfName: "work" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] }),
    ]);

    const [binding] = gatherBindings(journals, store, { journalNames: [], shelf: "work", includeCalendar: true });

    expect(binding?.kind === "calendar" ? binding.owner : null).toEqual({ kind: "shelf", shelfName: "work" });
  });

  it("numbers each binding by its position in its owner's list", () => {
    const first = buildDecoration({ mode: "or", conditions: [weekday()], styles: [] });
    const second = buildDecoration({ mode: "or", conditions: [weekday()], styles: [] });
    const { journals, store } = build([first, second]);

    const bindings = gatherBindings(journals, store, { journalNames: ["daily"], shelf: null, includeCalendar: false });

    expect(bindings.map((b) => b.index)).toEqual([0, 1]);
  });

  it("gathers every shelf's bindings when no shelf is in scope", () => {
    const { journals, store } = build();
    store.save({ kind: "shelf", shelfName: "work" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] }),
    ]);
    store.save({ kind: "shelf", shelfName: "home" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: [], shelf: null, includeCalendar: true });

    expect(bindings.map((b) => (b.kind === "calendar" ? b.owner : null))).toEqual([
      { kind: "shelf", shelfName: "work" },
      { kind: "shelf", shelfName: "home" },
    ]);
  });

  it("omits other shelves' bindings when one shelf is in scope", () => {
    const { journals, store } = build();
    store.save({ kind: "shelf", shelfName: "home" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: [], shelf: "work", includeCalendar: true });

    expect(bindings).toEqual([]);
  });

  it("orders vault-wide bindings before shelf bindings", () => {
    const { journals, store } = build();
    store.save({ kind: "global" }, [buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);
    store.save({ kind: "shelf", shelfName: "work" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: [], shelf: null, includeCalendar: true });

    expect(bindings.map((b) => (b.kind === "calendar" ? b.owner.kind : null))).toEqual(["global", "shelf"]);
  });

  it("omits every calendar binding when the surface does not opt in", () => {
    const { journals, store } = build();
    store.save({ kind: "global" }, [buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);

    const bindings = gatherBindings(journals, store, { journalNames: [], shelf: null, includeCalendar: false });

    expect(bindings).toEqual([]);
  });

  it("drops journal bindings the filter rejects", () => {
    const { journals, store } = build([buildDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);

    const bindings = gatherBindings(journals, store, {
      journalNames: ["daily"],
      shelf: null,
      includeCalendar: false,
      filter: () => false,
    });

    expect(bindings).toEqual([]);
  });

  it("spares calendar bindings from a filter meant only for journal bindings", () => {
    const { journals, store } = build([buildDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);
    store.save({ kind: "global" }, [buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);

    const bindings = gatherBindings(journals, store, {
      journalNames: ["daily"],
      shelf: null,
      includeCalendar: true,
      filter: () => false,
    });

    expect(bindings.map((b) => b.kind)).toEqual(["calendar"]);
  });
});
