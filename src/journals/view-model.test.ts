import { beforeEach, describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { journalsCoreModule } from "./module";
import { JournalsRepository } from "./repository";
import { fixedJournal } from "./testing";
import { JournalsViewModel } from "./view-model";

import type { JournalConfig } from "./config";

async function viewModelOver(journals: Record<string, JournalConfig> = {}) {
  const harness = await testContainer({ modules: [journalsCoreModule], data: { journals } });
  return { harness, vm: harness.resolve(JournalsViewModel) };
}

describe("JournalsViewModel", () => {
  describe("journals", () => {
    it("yields the current entities", async () => {
      const { vm } = await viewModelOver({ daily: fixedJournal("daily", { type: "day" }) });

      expect(vm.journals.value.map((journal) => journal.name)).toEqual(["daily"]);
    });

    it("reflects mutations after create", async () => {
      const { harness, vm } = await viewModelOver();

      harness.resolve(JournalsRepository).create("daily", { type: "day" });

      expect(vm.journals.value.map((journal) => journal.name)).toEqual(["daily"]);
    });
  });

  describe("journalOptions", () => {
    it("returns name-labelled options for each journal", async () => {
      const { vm } = await viewModelOver({
        daily: fixedJournal("daily", { type: "day" }),
        weekly: fixedJournal("weekly", { type: "week" }),
      });

      expect(vm.journalOptions.value).toEqual([
        { value: "daily", label: "daily" },
        { value: "weekly", label: "weekly" },
      ]);
    });
  });

  describe("journalCount", () => {
    it("returns the number of journals", async () => {
      const { vm } = await viewModelOver({ daily: fixedJournal("daily", { type: "day" }) });

      expect(vm.journalCount.value).toBe(1);
    });
  });

  describe("getJournal", () => {
    it("returns Some for a known name", async () => {
      const { vm } = await viewModelOver({ daily: fixedJournal("daily", { type: "day" }) });

      expect(vm.getJournal("daily").isSome()).toBe(true);
    });

    it("returns None for an unknown name", async () => {
      const { vm } = await viewModelOver();

      expect(vm.getJournal("nope").isNone()).toBe(true);
    });
  });

  describe("isJournalNameAvailable", () => {
    let harness: Awaited<ReturnType<typeof viewModelOver>>;

    beforeEach(async () => {
      harness = await viewModelOver({ daily: fixedJournal("daily", { type: "day" }) });
    });

    it("is false when the name is in use", () => {
      expect(harness.vm.isJournalNameAvailable("daily")).toBe(false);
    });

    it("is true when the name is free", () => {
      expect(harness.vm.isJournalNameAvailable("other")).toBe(true);
    });

    it("treats the excludeCurrent name as available", () => {
      expect(harness.vm.isJournalNameAvailable("daily", "daily")).toBe(true);
    });
  });
});
