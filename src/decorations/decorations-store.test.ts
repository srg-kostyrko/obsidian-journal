import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { JournalsRepository, journalDefaultsFor, type JournalConfig, type JournalsEvents } from "@/journals";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { DecorationsStore } from "./decorations-store";
import { decorationsSlice } from "./settings/slice";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";

function build(options: { journals?: Record<string, JournalConfig>; shelves?: Record<string, ShelfConfig> } = {}) {
  const { container, service } = createSettingsService({ slices: [decorationsSlice] });
  const journalStorage = reactive<Record<string, JournalConfig>>({ ...options.journals });
  const shelfStorage = reactive<Record<string, ShelfConfig>>({ ...options.shelves });
  container
    .register(JournalsRepository)
    .useValue(JournalsRepository.fromParts(journalStorage, createNanoEvents<JournalsEvents>()));
  container
    .register(ShelvesRepository)
    .useValue(ShelvesRepository.fromParts(shelfStorage, createNanoEvents<ShelvesEvents>()));
  container.register(DecorationsStore).useClass(DecorationsStore);
  return { store: container.resolve(DecorationsStore), journalStorage, shelfStorage, service };
}

const calendarDecoration = buildCalendarDecoration({
  mode: "and",
  conditions: [buildCondition("weekday", { weekdays: [6] })],
  styles: [buildStyle("background")],
});

describe("DecorationsStore", () => {
  describe("list", () => {
    it("returns a journal's own decorations", () => {
      const journal = { ...journalDefaultsFor({ type: "day" }, "daily"), decorations: [buildDecoration()] };
      const { store } = build({ journals: { daily: journal } });
      expect(store.list({ kind: "journal", journalName: "daily" })).toEqual(journal.decorations);
    });

    it("returns an empty list for a journal that no longer exists", () => {
      const { store } = build();
      expect(store.list({ kind: "journal", journalName: "gone" })).toEqual([]);
    });
  });

  describe("calendarList", () => {
    it("returns a shelf's own calendar decorations", () => {
      const { store } = build({
        shelves: { work: { name: "work", journals: [], decorations: [calendarDecoration] } },
      });
      expect(store.calendarList({ kind: "shelf", shelfName: "work" })).toEqual([calendarDecoration]);
    });

    it("returns the vault-wide calendar decorations", () => {
      const { store, service } = build();
      service.getSlice(decorationsSlice).state = { decorations: [calendarDecoration] };
      expect(store.calendarList({ kind: "global" })).toEqual([calendarDecoration]);
    });
  });

  describe("save", () => {
    it("writes a shelf's decorations back to the shelf", () => {
      const { store, shelfStorage } = build({ shelves: { work: { name: "work", journals: [], decorations: [] } } });
      store.save({ kind: "shelf", shelfName: "work" }, [calendarDecoration]);
      expect(shelfStorage.work.decorations).toEqual([calendarDecoration]);
    });

    it("writes global decorations back to the settings slice", () => {
      const { store, service } = build();
      store.save({ kind: "global" }, [calendarDecoration]);
      expect(service.getSlice(decorationsSlice).state.decorations).toEqual([calendarDecoration]);
    });
  });

  describe("exists", () => {
    it("reports an existing journal as present", () => {
      const journal = journalDefaultsFor({ type: "day" }, "daily");
      const { store } = build({ journals: { daily: journal } });
      expect(store.exists({ kind: "journal", journalName: "daily" })).toBe(true);
    });

    it("reports a missing journal as absent", () => {
      const { store } = build();
      expect(store.exists({ kind: "journal", journalName: "gone" })).toBe(false);
    });

    it("reports a missing shelf as absent", () => {
      const { store } = build();
      expect(store.exists({ kind: "shelf", shelfName: "gone" })).toBe(false);
    });

    it("always reports the global owner as present", () => {
      const { store } = build();
      expect(store.exists({ kind: "global" })).toBe(true);
    });
  });
});
