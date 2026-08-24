import { describe, expect, it } from "vitest";

import { JournalsRepository, UnknownJournalError, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { shelvesCollection, type ShelfConfig } from "./config";
import { UnknownShelfError } from "./errors";
import { shelvesCoreModule } from "./module";
import { ShelvesService } from "./service";
import { buildShelf } from "./testing";

async function buildShelves(
  initial: {
    journals?: Record<string, JournalConfig>;
    shelves?: Record<string, ShelfConfig>;
  } = {},
) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { journals: initial.journals ?? {}, shelves: initial.shelves ?? {} },
  });
  return {
    service: harness.resolve(ShelvesService),
    journalsRepo: harness.resolve(JournalsRepository),
    shelvesStorage: harness.settings.recordOf(shelvesCollection),
  };
}

describe("ShelvesService", () => {
  describe("assign", () => {
    it("appends the journal to the target shelf", async () => {
      const { service, shelvesStorage } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: { Personal: buildShelf("Personal") },
      });

      service.assign("daily", "Personal");

      expect(shelvesStorage.Personal?.journals).toEqual(["daily"]);
    });

    it("moves a journal off its current shelf", async () => {
      const { service, shelvesStorage } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: { Old: buildShelf("Old", { journals: ["daily"] }), New: buildShelf("New") },
      });

      service.assign("daily", "New");

      expect(shelvesStorage.Old?.journals).toEqual([]);
      expect(shelvesStorage.New?.journals).toEqual(["daily"]);
    });

    it("removes the journal from its current shelf when shelfName is empty", async () => {
      const { service, shelvesStorage } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: { Personal: buildShelf("Personal", { journals: ["daily"] }) },
      });

      service.assign("daily", "");

      expect(shelvesStorage.Personal?.journals).toEqual([]);
    });

    it("does not duplicate when assigning to the same shelf the journal is already on", async () => {
      const { service, shelvesStorage } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: { Personal: buildShelf("Personal", { journals: ["daily"] }) },
      });

      service.assign("daily", "Personal");

      expect(shelvesStorage.Personal?.journals).toEqual(["daily"]);
    });

    it("rejects unknown journal", async () => {
      const { service } = await buildShelves({ shelves: { Personal: buildShelf("Personal") } });

      const result = service.assign("nope", "Personal");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects unknown shelf", async () => {
      const { service } = await buildShelves({ journals: { daily: fixedJournal("daily", { type: "day" }) } });

      const result = service.assign("daily", "ghost");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });
  });

  describe("shelfOf", () => {
    it("returns the name of the shelf containing the journal", async () => {
      const { service } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: { Personal: buildShelf("Personal", { journals: ["daily"] }) },
      });

      expect(service.shelfOf("daily")).toBe("Personal");
    });

    it("returns an empty string when the journal is on no shelf", async () => {
      const { service } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: { Personal: buildShelf("Personal") },
      });

      expect(service.shelfOf("daily")).toBe("");
    });
  });

  describe("cascade on journal rename", () => {
    it("replaces the old name with the new one in every shelf", async () => {
      const { journalsRepo, shelvesStorage } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: {
          Personal: buildShelf("Personal", { journals: ["daily"] }),
          Home: buildShelf("Home", { journals: ["daily"] }),
        },
      });

      journalsRepo.rename("daily", "renamed");

      expect(shelvesStorage.Personal?.journals).toEqual(["renamed"]);
      expect(shelvesStorage.Home?.journals).toEqual(["renamed"]);
    });
  });

  describe("cascade on journal clone", () => {
    it("adds the copy beside the source on every shelf holding it", async () => {
      const { journalsRepo, shelvesStorage } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: {
          Personal: buildShelf("Personal", { journals: ["daily"] }),
          Home: buildShelf("Home", { journals: ["other", "daily"] }),
        },
      });

      journalsRepo.clone("daily", "daily copy");

      expect(shelvesStorage.Personal?.journals).toEqual(["daily", "daily copy"]);
      expect(shelvesStorage.Home?.journals).toEqual(["other", "daily", "daily copy"]);
    });

    it("leaves shelves that do not hold the source untouched", async () => {
      const { journalsRepo, shelvesStorage } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: {
          Personal: buildShelf("Personal", { journals: ["daily"] }),
          Work: buildShelf("Work", { journals: ["other"] }),
        },
      });

      journalsRepo.clone("daily", "daily copy");

      expect(shelvesStorage.Work?.journals).toEqual(["other"]);
    });

    it("adds the copy to no shelf when the source is on none", async () => {
      const { journalsRepo, shelvesStorage } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: { Personal: buildShelf("Personal", { journals: ["other"] }) },
      });

      journalsRepo.clone("daily", "daily copy");

      expect(shelvesStorage.Personal?.journals).toEqual(["other"]);
    });
  });

  describe("cascade on journal delete", () => {
    it("removes the journal name from every shelf", async () => {
      const { journalsRepo, shelvesStorage } = await buildShelves({
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: { Personal: buildShelf("Personal", { journals: ["daily", "other"] }) },
      });

      journalsRepo.delete("daily");

      expect(shelvesStorage.Personal?.journals).toEqual(["other"]);
    });
  });

  describe("hasShelves", () => {
    it("returns false when no shelves exist", async () => {
      const { service } = await buildShelves({ shelves: {} });

      expect(service.hasShelves()).toBe(false);
    });

    it("returns true when at least one shelf exists", async () => {
      const { service } = await buildShelves({ shelves: { Personal: buildShelf("Personal") } });

      expect(service.hasShelves()).toBe(true);
    });
  });
});
