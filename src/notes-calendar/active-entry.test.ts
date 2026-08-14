import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DayPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeWorkspaceService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";
import type { JournalEntry } from "@/journals";

import { ActiveEntryViewModel } from "./active-entry";

interface Harness {
  vm: ActiveEntryViewModel;
  workspace: FakeWorkspaceService;
  index: JournalsIndex;
}

function build(): Harness {
  const c = new Container();
  const workspace = new FakeWorkspaceService();
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel);
  const index = c.resolve(JournalsIndex);
  const vm = c.resolve(ActiveEntryViewModel);
  return { vm, workspace, index };
}

const dailyPath = "Daily/2026-05-25.md" as VaultPath;
const anchor = DayPeriod.containing(date("2026-05-25")).anchor.toAnchor();
const entry: JournalEntry = { journalName: "daily", anchor, path: dailyPath };

describe("ActiveEntryViewModel", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("initial state", () => {
    it("is null when no active note exists at construction", () => {
      const { vm } = build();
      expect(vm.active.value).toBeNull();
    });

    it("reflects the active note's journal entry when one exists at construction", () => {
      const c = new Container();
      const workspace = new FakeWorkspaceService();
      workspace.setActive(dailyPath);
      c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
      c.register(JournalsIndex).useClass(JournalsIndex);
      c.resolve(JournalsIndex).register(entry);
      c.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel);

      const vm = c.resolve(ActiveEntryViewModel);
      expect(vm.active.value).toEqual({ journalName: "daily", anchor });
    });
  });

  describe("active-note-changed", () => {
    it("updates active when a journal note becomes the active file", () => {
      const { vm, workspace, index } = build();
      index.register(entry);
      workspace.setActive(dailyPath);
      expect(vm.active.value).toEqual({ journalName: "daily", anchor });
    });

    it("clears active when a non-journal file becomes active", () => {
      const { vm, workspace, index } = build();
      index.register(entry);
      workspace.setActive(dailyPath);
      workspace.setActive("Other/random.md" as VaultPath);
      expect(vm.active.value).toBeNull();
    });
  });

  describe("entryChanged", () => {
    it("updates active when the active note registers in the index", () => {
      const { vm, workspace, index } = build();
      workspace.setActive(dailyPath);
      expect(vm.active.value).toBeNull();
      index.register(entry);
      expect(vm.active.value).toEqual({ journalName: "daily", anchor });
    });

    it("clears active when the active note unregisters from the index", () => {
      const { vm, workspace, index } = build();
      index.register(entry);
      workspace.setActive(dailyPath);
      index.unregister(dailyPath);
      expect(vm.active.value).toBeNull();
    });

    it("ignores entryChanged for unrelated paths", () => {
      const { vm, workspace, index } = build();
      index.register(entry);
      workspace.setActive(dailyPath);
      const initial = vm.active.value;
      index.register({ journalName: "weekly", anchor, path: "Weekly/2026-W22.md" as VaultPath });
      expect(vm.active.value).toBe(initial);
    });
  });
});
