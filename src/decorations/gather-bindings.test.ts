import { describe, expect, it } from "vitest";

import { JournalsRepository } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { DecorationsStore } from "./decorations-store";
import { gatherBindings, gatherFixedBindings, gatherIntervalBindings } from "./gather-bindings";
import { decorationsModule } from "./module";
import { decorationsSettingsCoreModule } from "./settings/module";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";

async function build(
  journalDecorations: JournalConfig["decorations"] = [],
  extraJournals: Record<string, JournalConfig> = {},
) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule],
    data: {
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: journalDecorations }),
        ...extraJournals,
      },
      shelves: {
        work: buildShelf("work"),
        home: buildShelf("home"),
      },
      decorations: { decorations: [] },
    },
  });
  return { journals: harness.resolve(JournalsRepository), store: harness.resolve(DecorationsStore) };
}

const weekday = () => buildCondition("weekday", { weekdays: [1] });

const NON_OFFSET_INDEX = 0;
const OFFSET_INDEX = 1;

function buildWithSprint() {
  return build([buildDecoration({ mode: "or", conditions: [weekday()], styles: [] })], {
    sprint: customJournal("sprint", "week", 2, "2026-05-25", {
      decorations: [
        buildDecoration({ mode: "or", conditions: [buildCondition("has-note")], styles: [] }),
        buildDecoration({ mode: "or", conditions: [buildCondition("offset", { offset: 1 })], styles: [] }),
      ],
    }),
  });
}

describe("gatherBindings", () => {
  it("orders vault-wide bindings before journal bindings", async () => {
    const { journals, store } = await build([
      buildDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);
    store.save({ kind: "global" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: ["daily"], shelf: null, includeCalendar: true });

    expect(bindings.map((b) => b.kind)).toEqual(["calendar", "journal"]);
  });

  it("orders shelf bindings before journal bindings", async () => {
    const { journals, store } = await build([
      buildDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);
    store.save({ kind: "shelf", shelfName: "work" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [buildStyle("background")] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: ["daily"], shelf: "work", includeCalendar: true });

    expect(bindings.map((b) => b.kind)).toEqual(["calendar", "journal"]);
  });

  it("labels a vault-wide binding with the global owner", async () => {
    const { journals, store } = await build();
    store.save({ kind: "global" }, [buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);

    const [binding] = gatherBindings(journals, store, { journalNames: [], shelf: null, includeCalendar: true });

    expect(binding?.kind === "calendar" ? binding.owner : null).toEqual({ kind: "global" });
  });

  it("labels a shelf binding with its shelf owner", async () => {
    const { journals, store } = await build();
    store.save({ kind: "shelf", shelfName: "work" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] }),
    ]);

    const [binding] = gatherBindings(journals, store, { journalNames: [], shelf: "work", includeCalendar: true });

    expect(binding?.kind === "calendar" ? binding.owner : null).toEqual({ kind: "shelf", shelfName: "work" });
  });

  it("numbers each binding by its position in its owner's list", async () => {
    const first = buildDecoration({ mode: "or", conditions: [weekday()], styles: [] });
    const second = buildDecoration({ mode: "or", conditions: [weekday()], styles: [] });
    const { journals, store } = await build([first, second]);

    const bindings = gatherBindings(journals, store, { journalNames: ["daily"], shelf: null, includeCalendar: false });

    expect(bindings.map((b) => b.index)).toEqual([0, 1]);
  });

  it("gathers every shelf's bindings when no shelf is in scope", async () => {
    const { journals, store } = await build();
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

  it("omits other shelves' bindings when one shelf is in scope", async () => {
    const { journals, store } = await build();
    store.save({ kind: "shelf", shelfName: "home" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: [], shelf: "work", includeCalendar: true });

    expect(bindings).toEqual([]);
  });

  it("orders vault-wide bindings before shelf bindings", async () => {
    const { journals, store } = await build();
    store.save({ kind: "global" }, [buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);
    store.save({ kind: "shelf", shelfName: "work" }, [
      buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] }),
    ]);

    const bindings = gatherBindings(journals, store, { journalNames: [], shelf: null, includeCalendar: true });

    expect(bindings.map((b) => (b.kind === "calendar" ? b.owner.kind : null))).toEqual(["global", "shelf"]);
  });

  it("omits every calendar binding when the surface does not opt in", async () => {
    const { journals, store } = await build();
    store.save({ kind: "global" }, [buildCalendarDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);

    const bindings = gatherBindings(journals, store, { journalNames: [], shelf: null, includeCalendar: false });

    expect(bindings).toEqual([]);
  });

  it("drops journal bindings the filter rejects", async () => {
    const { journals, store } = await build([buildDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);

    const bindings = gatherBindings(journals, store, {
      journalNames: ["daily"],
      shelf: null,
      includeCalendar: false,
      filter: () => false,
    });

    expect(bindings).toEqual([]);
  });

  it("spares calendar bindings from a filter meant only for journal bindings", async () => {
    const { journals, store } = await build([buildDecoration({ mode: "or", conditions: [weekday()], styles: [] })]);
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

describe("gatherFixedBindings and gatherIntervalBindings", () => {
  it("excludes a custom journal's non-offset decoration from a fixed cell", async () => {
    const { journals, store } = await buildWithSprint();

    const bindings = gatherFixedBindings(journals, store, { journalNames: ["sprint"], shelf: null });

    expect(bindings.some((b) => b.kind === "journal" && b.index === NON_OFFSET_INDEX)).toBe(false);
  });

  it("admits a custom journal's offset decoration to a fixed cell", async () => {
    const { journals, store } = await buildWithSprint();

    const bindings = gatherFixedBindings(journals, store, { journalNames: ["sprint"], shelf: null });

    expect(bindings.some((b) => b.kind === "journal" && b.index === OFFSET_INDEX)).toBe(true);
  });

  it("excludes a custom journal's offset decoration from an interval", async () => {
    const { journals } = await buildWithSprint();

    const bindings = gatherIntervalBindings(journals, { journalName: "sprint" });

    expect(bindings.some((b) => b.kind === "journal" && b.index === OFFSET_INDEX)).toBe(false);
  });

  it("admits a custom journal's non-offset decoration to an interval", async () => {
    const { journals } = await buildWithSprint();

    const bindings = gatherIntervalBindings(journals, { journalName: "sprint" });

    expect(bindings.some((b) => b.kind === "journal" && b.index === NON_OFFSET_INDEX)).toBe(true);
  });

  it("keeps a non-custom journal's decorations in a fixed cell regardless of offset", async () => {
    const { journals, store } = await buildWithSprint();

    const bindings = gatherFixedBindings(journals, store, { journalNames: ["daily"], shelf: null });

    expect(bindings.some((b) => b.kind === "journal" && b.journalName === "daily")).toBe(true);
  });
});
