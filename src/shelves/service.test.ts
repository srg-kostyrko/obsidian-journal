import { describe, expect, it } from "vitest";

import { JournalsRepository, UnknownJournalError } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { shelvesCollection } from "./config";
import { UnknownShelfError } from "./errors";
import { shelvesCoreModule } from "./module";
import { ShelvesService } from "./service";
import { buildShelf } from "./testing";

describe("ShelvesService", () => {
  describe("assign", () => {
    it("appends the journal to the target shelf", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: { Personal: buildShelf("Personal") },
        },
      });

      harness.resolve(ShelvesService).assign("daily", "Personal");

      expect(harness.settings.recordOf(shelvesCollection).Personal?.journals).toEqual(["daily"]);
    });

    it("moves a journal off its current shelf", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: { Old: buildShelf("Old", { journals: ["daily"] }), New: buildShelf("New") },
        },
      });

      harness.resolve(ShelvesService).assign("daily", "New");

      expect(harness.settings.recordOf(shelvesCollection).Old?.journals).toEqual([]);
      expect(harness.settings.recordOf(shelvesCollection).New?.journals).toEqual(["daily"]);
    });

    it("removes the journal from its current shelf when shelfName is empty", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: { Personal: buildShelf("Personal", { journals: ["daily"] }) },
        },
      });

      harness.resolve(ShelvesService).assign("daily", "");

      expect(harness.settings.recordOf(shelvesCollection).Personal?.journals).toEqual([]);
    });

    it("does not duplicate when assigning to the same shelf the journal is already on", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: { Personal: buildShelf("Personal", { journals: ["daily"] }) },
        },
      });

      harness.resolve(ShelvesService).assign("daily", "Personal");

      expect(harness.settings.recordOf(shelvesCollection).Personal?.journals).toEqual(["daily"]);
    });

    it("rejects unknown journal", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { journals: {}, shelves: { Personal: buildShelf("Personal") } },
      });

      const result = harness.resolve(ShelvesService).assign("nope", "Personal");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownJournalError);
    });

    it("rejects unknown shelf", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) }, shelves: {} },
      });

      const result = harness.resolve(ShelvesService).assign("daily", "ghost");

      expect(result.isErr() && result.error).toBeInstanceOf(UnknownShelfError);
    });
  });

  describe("shelfOf", () => {
    it("returns the name of the shelf containing the journal", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: { Personal: buildShelf("Personal", { journals: ["daily"] }) },
        },
      });

      expect(harness.resolve(ShelvesService).shelfOf("daily")).toBe("Personal");
    });

    it("returns an empty string when the journal is on no shelf", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: { Personal: buildShelf("Personal") },
        },
      });

      expect(harness.resolve(ShelvesService).shelfOf("daily")).toBe("");
    });
  });

  describe("cascade on journal rename", () => {
    it("replaces the old name with the new one in every shelf", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: {
            Personal: buildShelf("Personal", { journals: ["daily"] }),
            Home: buildShelf("Home", { journals: ["daily"] }),
          },
        },
      });

      harness.resolve(JournalsRepository).rename("daily", "renamed");

      expect(harness.settings.recordOf(shelvesCollection).Personal?.journals).toEqual(["renamed"]);
      expect(harness.settings.recordOf(shelvesCollection).Home?.journals).toEqual(["renamed"]);
    });
  });

  describe("cascade on journal clone", () => {
    it("adds the copy beside the source on every shelf holding it", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: {
            Personal: buildShelf("Personal", { journals: ["daily"] }),
            Home: buildShelf("Home", { journals: ["other", "daily"] }),
          },
        },
      });

      harness.resolve(JournalsRepository).clone("daily", "daily copy");

      expect(harness.settings.recordOf(shelvesCollection).Personal?.journals).toEqual(["daily", "daily copy"]);
      expect(harness.settings.recordOf(shelvesCollection).Home?.journals).toEqual(["other", "daily", "daily copy"]);
    });

    it("leaves shelves that do not hold the source untouched", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: {
            Personal: buildShelf("Personal", { journals: ["daily"] }),
            Work: buildShelf("Work", { journals: ["other"] }),
          },
        },
      });

      harness.resolve(JournalsRepository).clone("daily", "daily copy");

      expect(harness.settings.recordOf(shelvesCollection).Work?.journals).toEqual(["other"]);
    });

    it("adds the copy to no shelf when the source is on none", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: { Personal: buildShelf("Personal", { journals: ["other"] }) },
        },
      });

      harness.resolve(JournalsRepository).clone("daily", "daily copy");

      expect(harness.settings.recordOf(shelvesCollection).Personal?.journals).toEqual(["other"]);
    });
  });

  describe("cascade on journal delete", () => {
    it("removes the journal name from every shelf", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }) },
          shelves: { Personal: buildShelf("Personal", { journals: ["daily", "other"] }) },
        },
      });

      harness.resolve(JournalsRepository).delete("daily");

      expect(harness.settings.recordOf(shelvesCollection).Personal?.journals).toEqual(["other"]);
    });
  });

  describe("hasShelves", () => {
    it("returns false when no shelves exist", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: {} },
      });

      expect(harness.resolve(ShelvesService).hasShelves()).toBe(false);
    });

    it("returns true when at least one shelf exists", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, shelvesCoreModule],
        data: { shelves: { Personal: buildShelf("Personal") } },
      });

      expect(harness.resolve(ShelvesService).hasShelves()).toBe(true);
    });
  });
});
