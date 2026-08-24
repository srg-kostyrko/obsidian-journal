import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { journalsCoreModule } from "./module";
import { JournalsRepository } from "./repository";
import { fixedJournal } from "./testing";
import { JournalsViewModel } from "./view-model";

describe("JournalsViewModel", () => {
  describe("journals", () => {
    it("yields the current entities", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });

      expect(resolve(JournalsViewModel).journals.value.map((journal) => journal.name)).toEqual(["daily"]);
    });

    it("reflects mutations after create", async () => {
      const { resolve } = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const repo = resolve(JournalsRepository);
      const vm = resolve(JournalsViewModel);

      repo.create("daily", { type: "day" });

      expect(vm.journals.value.map((journal) => journal.name)).toEqual(["daily"]);
    });
  });

  describe("journalOptions", () => {
    it("returns name-labelled options for each journal", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal("daily", { type: "day" }),
            weekly: fixedJournal("weekly", { type: "week" }),
          },
        },
      });

      expect(resolve(JournalsViewModel).journalOptions.value).toEqual([
        { value: "daily", label: "daily" },
        { value: "weekly", label: "weekly" },
      ]);
    });
  });

  describe("journalCount", () => {
    it("returns the number of journals", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });

      expect(resolve(JournalsViewModel).journalCount.value).toBe(1);
    });
  });

  describe("getJournal", () => {
    it("returns Some for a known name", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });

      expect(resolve(JournalsViewModel).getJournal("daily").isSome()).toBe(true);
    });

    it("returns None for an unknown name", async () => {
      const { resolve } = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });

      expect(resolve(JournalsViewModel).getJournal("nope").isNone()).toBe(true);
    });
  });

  describe("isJournalNameAvailable", () => {
    it("is false when the name is in use", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });

      expect(resolve(JournalsViewModel).isJournalNameAvailable("daily")).toBe(false);
    });

    it("is true when the name is free", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });

      expect(resolve(JournalsViewModel).isJournalNameAvailable("other")).toBe(true);
    });

    it("treats the excludeCurrent name as available", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });

      expect(resolve(JournalsViewModel).isJournalNameAvailable("daily", "daily")).toBe(true);
    });
  });
});
