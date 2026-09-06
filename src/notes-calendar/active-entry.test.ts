import { describe, expect, it } from "vitest";

import { DayPeriod } from "@/calendar";
import { date } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals";
import type { JournalEntry, NoteletEntry } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { testContainer, type TestHarness } from "@/testing";

import { ActiveEntryViewModel } from "./active-entry";
import { notesCalendarModule } from "./module";

const MODULES = [journalsCoreModule, notesCalendarModule];

const dailyPath = "Daily/2026-05-25.md" as VaultPath;
const otherEntryPath = "Weekly/2026-W22.md" as VaultPath;
const dailyAnchor = DayPeriod.containing(date("2026-05-25")).anchor.toAnchor();
const entry: JournalEntry = { journalName: "daily", anchor: dailyAnchor, path: dailyPath };

const noteletPath = "Work/Standup 1.md" as VaultPath;
const noteletAnchor = DayPeriod.containing(date("2026-09-02")).anchor.toAnchor();
const notelet: NoteletEntry = {
  kind: "notelet",
  journalName: "Work",
  anchor: noteletAnchor,
  path: noteletPath,
  typeName: "Standup",
  typeId: null,
};

function bootHarness(autoLoad = true): Promise<TestHarness> {
  return testContainer({ modules: MODULES, autoLoad });
}

describe("ActiveEntryViewModel", () => {
  describe("initial state", () => {
    it("is null when no active note exists at construction", async () => {
      const harness = await bootHarness();

      expect(harness.resolve(ActiveEntryViewModel).active.value).toBeNull();
    });

    it("reflects the active note's journal entry when one exists at construction", async () => {
      // autoLoad: false — ActiveEntryViewModel is registered eager, so the active file and the
      // index entry must both be in place before it is resolved, or the eager construction would
      // read the state before this test ever sets it.
      const harness = await bootHarness(false);
      harness.host.emitFileOpen(harness.host.putFile(dailyPath));
      harness.resolve(JournalsIndex).register(entry);

      const vm = harness.resolve(ActiveEntryViewModel);

      expect(vm.active.value).toEqual({ journalName: "daily", anchor: dailyAnchor });
    });
  });

  describe("active-note-changed", () => {
    it("updates active when a journal note becomes the active file", async () => {
      const harness = await bootHarness();
      const vm = harness.resolve(ActiveEntryViewModel);
      harness.resolve(JournalsIndex).register(entry);

      harness.host.emitFileOpen(harness.host.putFile(dailyPath));

      expect(vm.active.value).toEqual({ journalName: "daily", anchor: dailyAnchor });
    });

    it("clears active when a non-journal file becomes active", async () => {
      const harness = await bootHarness();
      const vm = harness.resolve(ActiveEntryViewModel);
      harness.resolve(JournalsIndex).register(entry);
      harness.host.emitFileOpen(harness.host.putFile(dailyPath));

      harness.host.emitFileOpen(harness.host.putFile("Other/random.md"));

      expect(vm.active.value).toBeNull();
    });
  });

  describe("entryChanged", () => {
    it("updates active when the active note registers in the index", async () => {
      const harness = await bootHarness();
      const vm = harness.resolve(ActiveEntryViewModel);
      harness.host.emitFileOpen(harness.host.putFile(dailyPath));
      expect(vm.active.value).toBeNull();

      harness.resolve(JournalsIndex).register(entry);

      expect(vm.active.value).toEqual({ journalName: "daily", anchor: dailyAnchor });
    });

    it("clears active when the active note unregisters from the index", async () => {
      const harness = await bootHarness();
      const vm = harness.resolve(ActiveEntryViewModel);
      const index = harness.resolve(JournalsIndex);
      index.register(entry);
      harness.host.emitFileOpen(harness.host.putFile(dailyPath));

      index.unregister(dailyPath);

      expect(vm.active.value).toBeNull();
    });

    it("ignores entryChanged for unrelated paths", async () => {
      const harness = await bootHarness();
      const vm = harness.resolve(ActiveEntryViewModel);
      const index = harness.resolve(JournalsIndex);
      index.register(entry);
      harness.host.emitFileOpen(harness.host.putFile(dailyPath));
      const initial = vm.active.value;

      index.register({ journalName: "weekly", anchor: dailyAnchor, path: otherEntryPath });

      expect(vm.active.value).toBe(initial);
    });
  });

  describe("notelets", () => {
    it("treats an active notelet as journal context", async () => {
      const harness = await bootHarness();
      const vm = harness.resolve(ActiveEntryViewModel);
      harness.resolve(JournalsIndex).register(notelet);

      harness.host.emitFileOpen(harness.host.putFile(noteletPath));

      expect(vm.active.value).toEqual({ journalName: "Work", anchor: noteletAnchor });
    });

    it("picks up a notelet registered after the note is already open", async () => {
      const harness = await bootHarness();
      const vm = harness.resolve(ActiveEntryViewModel);
      harness.host.emitFileOpen(harness.host.putFile(noteletPath));
      expect(vm.active.value).toBeNull();

      harness.resolve(JournalsIndex).register(notelet);

      expect(vm.active.value).toEqual({ journalName: "Work", anchor: noteletAnchor });
    });

    it("clears when the notelet is removed", async () => {
      const harness = await bootHarness();
      const vm = harness.resolve(ActiveEntryViewModel);
      const index = harness.resolve(JournalsIndex);
      index.register(notelet);
      harness.host.emitFileOpen(harness.host.putFile(noteletPath));
      expect(vm.active.value).toEqual({ journalName: "Work", anchor: noteletAnchor });

      index.unregister(noteletPath);

      expect(vm.active.value).toBeNull();
    });
  });
});
