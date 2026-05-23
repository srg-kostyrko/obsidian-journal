import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { journalDefaultsFor, type JournalConfig } from "./config";
import { JournalsRepository, type JournalsEvents } from "./repository";
import { JournalsViewModel } from "./view-model";

function buildViewModel(initial: Record<string, JournalConfig> = {}) {
  const storage = { ...initial };
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const vm = JournalsViewModel.fromRepository(repo);
  return { vm, repo, storage, events };
}

describe("JournalsViewModel", () => {
  describe("journals", () => {
    it("yields the current entities", () => {
      const { vm } = buildViewModel({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      expect(vm.journals.value.map((journal) => journal.name)).toEqual(["daily"]);
    });

    it("reflects added journals after create", () => {
      const { vm, repo } = buildViewModel();
      repo.create("daily", { type: "day" });
      expect(vm.journals.value.map((journal) => journal.name)).toEqual(["daily"]);
    });
  });

  describe("journalOptions", () => {
    it("returns name-labelled options for each journal", () => {
      const { vm } = buildViewModel({
        daily: journalDefaultsFor({ type: "day" }, "daily"),
        weekly: journalDefaultsFor({ type: "week" }, "weekly"),
      });
      expect(vm.journalOptions.value).toEqual([
        { value: "daily", label: "daily" },
        { value: "weekly", label: "weekly" },
      ]);
    });
  });

  describe("journalCount", () => {
    it("returns the number of journals", () => {
      const { vm } = buildViewModel({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      expect(vm.journalCount.value).toBe(1);
    });
  });

  describe("getJournal", () => {
    it("returns Some for a known name", () => {
      const { vm } = buildViewModel({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      expect(vm.getJournal("daily").isSome()).toBe(true);
    });

    it("returns None for an unknown name", () => {
      const { vm } = buildViewModel();
      expect(vm.getJournal("nope").isNone()).toBe(true);
    });
  });

  describe("isJournalNameAvailable", () => {
    it("is false when the name is in use", () => {
      const { vm } = buildViewModel({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      expect(vm.isJournalNameAvailable("daily")).toBe(false);
    });

    it("is true when the name is free", () => {
      const { vm } = buildViewModel({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      expect(vm.isJournalNameAvailable("other")).toBe(true);
    });

    it("treats the excludeCurrent name as available", () => {
      const { vm } = buildViewModel({ daily: journalDefaultsFor({ type: "day" }, "daily") });
      expect(vm.isJournalNameAvailable("daily", "daily")).toBe(true);
    });
  });
});
