import { describe, expect, it } from "vitest";

import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { ShelvesRepository } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { DecorationsStore } from "./decorations-store";
import { decorationsModule } from "./module";
import { decorationsSettingsCoreModule } from "./settings/module";
import { decorationsSlice } from "./settings/slice";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";

import type { CalendarDecoration } from "./config";

async function build(
  options: {
    journals?: Record<string, JournalConfig>;
    shelves?: Record<string, ShelfConfig>;
    decorations?: readonly CalendarDecoration[];
  } = {},
) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule],
    data: {
      journals: options.journals ?? {},
      shelves: options.shelves ?? {},
      decorations: { decorations: options.decorations ?? [] },
    },
  });
  return { harness, store: harness.resolve(DecorationsStore) };
}

const calendarDecoration = buildCalendarDecoration({
  mode: "and",
  conditions: [buildCondition("weekday", { weekdays: [6] })],
  styles: [buildStyle("background")],
});

describe("DecorationsStore", () => {
  describe("list", () => {
    it("returns a journal's own decorations", async () => {
      const journal = fixedJournal("daily", { type: "day" }, { decorations: [buildDecoration()] });
      const { store } = await build({ journals: { daily: journal } });
      expect(store.list({ kind: "journal", journalName: "daily" })).toEqual(journal.decorations);
    });

    it("returns an empty list for a journal that no longer exists", async () => {
      const { store } = await build();
      expect(store.list({ kind: "journal", journalName: "gone" })).toEqual([]);
    });
  });

  describe("calendarList", () => {
    it("returns a shelf's own calendar decorations", async () => {
      const { store } = await build({
        shelves: { work: buildShelf("work", { decorations: [calendarDecoration] }) },
      });
      expect(store.calendarList({ kind: "shelf", shelfName: "work" })).toEqual([calendarDecoration]);
    });

    it("returns the vault-wide calendar decorations", async () => {
      const { store } = await build({ decorations: [calendarDecoration] });
      expect(store.calendarList({ kind: "global" })).toEqual([calendarDecoration]);
    });
  });

  describe("save", () => {
    it("writes a shelf's decorations back to the shelf", async () => {
      const { harness, store } = await build({ shelves: { work: buildShelf("work") } });
      store.save({ kind: "shelf", shelfName: "work" }, [calendarDecoration]);
      const shelf = harness.resolve(ShelvesRepository).get("work");
      expect(shelf.isSome() && shelf.value.decorations).toEqual([calendarDecoration]);
    });

    it("writes global decorations back to the settings slice", async () => {
      const { harness, store } = await build();
      store.save({ kind: "global" }, [calendarDecoration]);
      expect(harness.settings.getSlice(decorationsSlice).state.decorations).toEqual([calendarDecoration]);
    });
  });

  describe("exists", () => {
    it("reports an existing journal as present", async () => {
      const journal = fixedJournal("daily", { type: "day" });
      const { store } = await build({ journals: { daily: journal } });
      expect(store.exists({ kind: "journal", journalName: "daily" })).toBe(true);
    });

    it("reports a missing journal as absent", async () => {
      const { store } = await build();
      expect(store.exists({ kind: "journal", journalName: "gone" })).toBe(false);
    });

    it("reports a missing shelf as absent", async () => {
      const { store } = await build();
      expect(store.exists({ kind: "shelf", shelfName: "gone" })).toBe(false);
    });

    it("always reports the global owner as present", async () => {
      const { store } = await build();
      expect(store.exists({ kind: "global" })).toBe(true);
    });
  });
});
