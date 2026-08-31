import { beforeEach, describe, expect, it } from "vitest";

import { CommandsRepository, commandsModule } from "@/commands";
import { DynamicCommandRegistry } from "@/commands/command-registry";
import { commandsCoreModule } from "@/commands/module";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { JournalLifecycleFlowError, JournalNameTakenError, UnknownJournalError } from "@/journals/errors";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { JournalsRepository } from "@/journals/repository";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { SettingsUiService } from "@/settings";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";
import { journalsSettingsUiModule } from "../ui-module";

import { CloneJournalFlow } from "./clone-journal.flow";

const daily = () => fixedJournal("daily", { type: "day" }, { folder: "Daily/" });

describe("CloneJournalFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule, commandsCoreModule],
      data: { journals: { daily: daily() } },
    });
  });

  it("stores a copy of the source journal on submit", async () => {
    const promise = harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<unknown, { newName: string }>().submit({ newName: "daily copy" });
    await promise;
    expect(harness.resolve(JournalsRepository).get("daily copy").getOrUndefined()).toEqual({
      ...daily(),
      name: "daily copy",
    });
  });

  it("pushes the journal-edit subpage for the copy", async () => {
    const promise = harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<unknown, { newName: string }>().submit({ newName: "daily copy" });
    await promise;
    const ui = harness.resolve(SettingsUiService);
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily copy" });
  });

  it("returns the new name on submit", async () => {
    const promise = harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<unknown, { newName: string }>().submit({ newName: "daily copy" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ name: "daily copy" });
  });

  it("opens the modal with a free suggested name derived from the source", async () => {
    void harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    const opened = harness.modals.lastOpen<{ sourceName: string; suggestedName: string }, { newName: string }>();
    expect(opened.props).toEqual({ sourceName: "daily", suggestedName: "daily (copy)" });
    opened.cancel();
  });

  it("numbers the suggested name past copies that already exist", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule, commandsCoreModule],
      data: {
        journals: {
          daily: daily(),
          "daily (copy)": fixedJournal("daily (copy)", { type: "day" }),
          "daily (copy) 2": fixedJournal("daily (copy) 2", { type: "day" }),
        },
      },
    });
    void harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    const opened = harness.modals.lastOpen<{ sourceName: string; suggestedName: string }, { newName: string }>();
    expect(opened.props.suggestedName).toBe("daily (copy) 3");
    opened.cancel();
  });

  it("returns UserAborted('clone-journal-modal') when the modal is cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("clone-journal-modal");
  });

  it("maps a name-taken error to JournalLifecycleFlowError", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule, commandsCoreModule],
      data: { journals: { daily: daily(), weekly: fixedJournal("weekly", { type: "week" }) } },
    });
    const promise = harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<unknown, { newName: string }>().submit({ newName: "weekly" });
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      JournalNameTakenError,
    );
  });

  it("fails without opening a modal when the source journal is gone", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule, commandsCoreModule],
    });
    const result = await harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("clones notelet types with fresh ids when the toggle is on", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule, commandsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } },
          ),
        },
      },
    });
    const promise = harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    harness.modals
      .lastOpen<unknown, { newName: string; cloneNoteletTypes: boolean }>()
      .submit({ newName: "copy", cloneNoteletTypes: true });
    await promise;

    const clonedTypes = harness.resolve(JournalsRepository).get("copy").getOrUndefined()?.notelets ?? {};
    const ids = Object.keys(clonedTypes);
    expect(ids).toHaveLength(1);
    expect(ids).not.toContain("nt_1");
    expect(Object.values(clonedTypes).map((type) => type.name)).toEqual(["Standup"]);
    expect(Object.entries(clonedTypes).every(([id, type]) => type.id === id)).toBe(true);
  });

  it("clones no types and no commands when the toggle is off", async () => {
    harness = await testContainer({
      modules: [
        journalsCoreModule,
        journalsSettingsCoreModule,
        journalsSettingsUiModule,
        shelvesCoreModule,
        commandsModule,
      ],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } },
          ),
        },
        commands: {},
      },
      allow: { hostState: true },
      initialize: [DynamicCommandRegistry],
    });
    const promise = harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    harness.modals
      .lastOpen<unknown, { newName: string; cloneNoteletTypes: boolean }>()
      .submit({ newName: "copy", cloneNoteletTypes: false });
    await promise;

    expect(harness.resolve(JournalsRepository).get("copy").getOrUndefined()?.notelets).toEqual({});
    expect([...harness.resolve(CommandsRepository).find().entries()]).toEqual([]);
  });

  it("seeds a command for each cloned type", async () => {
    harness = await testContainer({
      modules: [
        journalsCoreModule,
        journalsSettingsCoreModule,
        journalsSettingsUiModule,
        shelvesCoreModule,
        commandsModule,
      ],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } },
          ),
        },
        commands: {},
      },
      allow: { hostState: true },
      initialize: [DynamicCommandRegistry],
    });
    const promise = harness.resolve(Flows).invoke(CloneJournalFlow, { journalName: "daily" });
    harness.modals
      .lastOpen<unknown, { newName: string; cloneNoteletTypes: boolean }>()
      .submit({ newName: "copy", cloneNoteletTypes: true });
    await promise;

    const targets = [...harness.resolve(CommandsRepository).find().entries()].map(([, command]) => command.target);
    expect(targets).toContainEqual(expect.objectContaining({ kind: "notelet", journalName: "copy" }));
  });
});
