import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import {
  journalDefaultsFor,
  JournalsRepository,
  UnknownJournalError,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";

import { UnknownShelfError } from "./errors";
import { ShelvesRepository, type ShelvesEvents } from "./repository";
import { ShelvesService } from "./service";

import type { ShelfConfig } from "./config";

function setup(
  initial: {
    journals?: Record<string, JournalConfig>;
    shelves?: Record<string, ShelfConfig>;
  } = {},
) {
  const journalsStorage = reactive<Record<string, JournalConfig>>({ ...initial.journals });
  const shelvesStorage = reactive<Record<string, ShelfConfig>>({ ...initial.shelves });
  const journalsEvents = createNanoEvents<JournalsEvents>();
  const shelvesEvents = createNanoEvents<ShelvesEvents>();
  const journalsRepo = JournalsRepository.fromParts(journalsStorage, journalsEvents);
  const shelvesRepo = ShelvesRepository.fromParts(shelvesStorage, shelvesEvents);
  const service = ShelvesService.fromParts(shelvesRepo, journalsRepo, journalsEvents);
  return {
    service,
    journalsRepo,
    shelvesRepo,
    journalsEvents,
    shelvesEvents,
    journalsStorage,
    shelvesStorage,
  };
}

const shelf = (name: string, journals: string[] = []): ShelfConfig => ({ name, journals, decorations: [] });
const journalConfig = (name: string) => journalDefaultsFor({ type: "day" }, name);

describe("ShelvesService", () => {
  describe("assign", () => {
    it("appends the journal to the target shelf", () => {
      const { service, shelvesStorage } = setup({
        journals: { daily: journalConfig("daily") },
        shelves: { Personal: shelf("Personal") },
      });
      service.assign("daily", "Personal");
      expect(shelvesStorage.Personal?.journals).toEqual(["daily"]);
    });

    it("moves a journal off its current shelf", () => {
      const { service, shelvesStorage } = setup({
        journals: { daily: journalConfig("daily") },
        shelves: { Old: shelf("Old", ["daily"]), New: shelf("New") },
      });
      service.assign("daily", "New");
      expect(shelvesStorage.Old?.journals).toEqual([]);
      expect(shelvesStorage.New?.journals).toEqual(["daily"]);
    });

    it("removes the journal from its current shelf when shelfName is empty", () => {
      const { service, shelvesStorage } = setup({
        journals: { daily: journalConfig("daily") },
        shelves: { Personal: shelf("Personal", ["daily"]) },
      });
      service.assign("daily", "");
      expect(shelvesStorage.Personal?.journals).toEqual([]);
    });

    it("does not duplicate when assigning to the same shelf the journal is already on", () => {
      const { service, shelvesStorage } = setup({
        journals: { daily: journalConfig("daily") },
        shelves: { Personal: shelf("Personal", ["daily"]) },
      });
      service.assign("daily", "Personal");
      expect(shelvesStorage.Personal?.journals).toEqual(["daily"]);
    });

    it("rejects unknown journal", () => {
      const { service } = setup({ shelves: { Personal: shelf("Personal") } });
      const result = service.assign("nope", "Personal");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects unknown shelf", () => {
      const { service } = setup({ journals: { daily: journalConfig("daily") } });
      const result = service.assign("daily", "ghost");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });
  });

  describe("shelfOf", () => {
    it("returns the name of the shelf containing the journal", () => {
      const { service } = setup({
        journals: { daily: journalConfig("daily") },
        shelves: { Personal: shelf("Personal", ["daily"]) },
      });
      expect(service.shelfOf("daily")).toBe("Personal");
    });

    it("returns an empty string when the journal is on no shelf", () => {
      const { service } = setup({
        journals: { daily: journalConfig("daily") },
        shelves: { Personal: shelf("Personal") },
      });
      expect(service.shelfOf("daily")).toBe("");
    });
  });

  describe("cascade on journal rename", () => {
    it("replaces the old name with the new one in every shelf", () => {
      const { journalsRepo, shelvesStorage } = setup({
        journals: { daily: journalConfig("daily") },
        shelves: {
          Personal: shelf("Personal", ["daily"]),
          Home: shelf("Home", ["daily"]),
        },
      });
      journalsRepo.rename("daily", "renamed");
      expect(shelvesStorage.Personal?.journals).toEqual(["renamed"]);
      expect(shelvesStorage.Home?.journals).toEqual(["renamed"]);
    });
  });

  describe("cascade on journal delete", () => {
    it("removes the journal name from every shelf", () => {
      const { journalsRepo, shelvesStorage } = setup({
        journals: { daily: journalConfig("daily") },
        shelves: { Personal: shelf("Personal", ["daily", "other"]) },
      });
      journalsRepo.delete("daily");
      expect(shelvesStorage.Personal?.journals).toEqual(["other"]);
    });
  });

  describe("hasShelves", () => {
    it("returns false when no shelves exist", () => {
      const { service } = setup({ shelves: {} });
      expect(service.hasShelves()).toBe(false);
    });

    it("returns true when at least one shelf exists", () => {
      const { service } = setup({ shelves: { Personal: shelf("Personal") } });
      expect(service.hasShelves()).toBe(true);
    });
  });
});
