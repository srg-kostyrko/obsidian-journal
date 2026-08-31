import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { JournalLifecycleFlowError, UnknownJournalError } from "@/journals/errors";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { JournalsEventsToken } from "@/journals/tokens";
import { SettingsUiService } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";
import { noteletTypeSubpage } from "../ui/notelet-type-subpage";
import { journalsSettingsUiModule } from "../ui-module";

import { DeleteNoteletTypeFlow } from "./delete-notelet-type.flow";

describe("DeleteNoteletTypeFlow", () => {
  let harness: TestHarness;
  const noteletPath = "Standup 1.md" as VaultPath;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              notelets: {
                nt_1: buildNoteletType({
                  id: "nt_1" as TypeId,
                  name: "Standup",
                  prompts: [
                    { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false },
                  ],
                }),
              },
            },
          ),
        },
      },
    });
    harness.host.putFile(noteletPath, "content", {
      journal: "daily",
      "journal-date": "2026-06-01",
      "journal-notelet": "Standup",
      "journal-notelet-index": 1,
      mood: "great",
      title: "keep",
    });
    harness.resolve(JournalsIndex).register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-06-01"),
      path: noteletPath,
      typeName: "Standup",
      typeId: "nt_1" as TypeId,
      counter: 1,
      answers: { mood: "great" },
    });
  });

  function invoke() {
    return harness.resolve(Flows).invoke(DeleteNoteletTypeFlow, { journalName: "daily", typeId: "nt_1" });
  }

  function openModal() {
    return harness.modals.lastOpen<
      { journalName: string; typeId: string; typeName: string },
      { mode: "keep" | "clear" | "delete" }
    >();
  }

  it("keeps the notes and removes only the type", async () => {
    const promise = invoke();
    openModal().submit({ mode: "keep" });
    await promise;

    expect(harness.host.files.get(noteletPath)?.frontmatter).toMatchObject({ "journal-notelet": "Standup" });
    expect(harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.notelets).toEqual({});
  });

  it("purges by the type's name as of when the modal closes, not the name it opened with", async () => {
    const promise = invoke();
    // Simulate the type having been renamed (config and index both moved to the new name — what
    // RenameNoteletTypeFlow's frontmatter cascade produces) while this confirmation modal is
    // still open. disconnectNoteletsOfType/deleteNoteletsOfType match by stored name, so purging
    // by the stale pre-modal name would find nothing under the new one.
    harness.resolve(JournalsRepository).update("daily", {
      notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Daily standup" }) },
    });
    harness.resolve(JournalsIndex).register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-06-01"),
      path: noteletPath,
      typeName: "Daily standup",
      typeId: "nt_1" as TypeId,
      counter: 1,
      answers: { mood: "great" },
    });

    openModal().submit({ mode: "delete" });
    await promise;

    expect(harness.host.files.has(noteletPath)).toBe(false);
  });

  it("clear strips the whole claim, not just the type key", async () => {
    const promise = invoke();
    openModal().submit({ mode: "clear" });
    await promise;

    expect(harness.host.files.get(noteletPath)?.frontmatter).toEqual({ title: "keep" });
  });

  it("delete trashes the type's notes", async () => {
    const promise = invoke();
    openModal().submit({ mode: "delete" });
    await promise;

    expect(harness.host.files.has(noteletPath)).toBe(false);
  });

  it("leaves another type's notelets untouched in every mode", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              notelets: {
                nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }),
                nt_2: buildNoteletType({ id: "nt_2" as TypeId, name: "Recipe" }),
              },
            },
          ),
        },
      },
    });
    const recipePath = "Recipe 1.md" as VaultPath;
    harness.host.putFile(noteletPath, "content", {
      journal: "daily",
      "journal-date": "2026-06-01",
      "journal-notelet": "Standup",
    });
    harness.host.putFile(recipePath, "content", {
      journal: "daily",
      "journal-date": "2026-06-01",
      "journal-notelet": "Recipe",
    });
    const index = harness.resolve(JournalsIndex);
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-06-01"),
      path: noteletPath,
      typeName: "Standup",
      typeId: "nt_1" as TypeId,
    });
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-06-01"),
      path: recipePath,
      typeName: "Recipe",
      typeId: "nt_2" as TypeId,
    });

    const promise = harness.resolve(Flows).invoke(DeleteNoteletTypeFlow, { journalName: "daily", typeId: "nt_1" });
    openModal().submit({ mode: "delete" });
    await promise;

    expect(harness.host.files.has(recipePath)).toBe(true);
  });

  it("emits noteletTypeDeleted, the event the command registry retires the type's command on", async () => {
    const events = harness.resolve(JournalsEventsToken);
    const seen: [string, string][] = [];
    events.on("noteletTypeDeleted", (journalName, typeId) => seen.push([journalName, typeId]));

    const promise = invoke();
    openModal().submit({ mode: "keep" });
    await promise;

    expect(seen).toEqual([["daily", "nt_1"]]);
  });

  it("returns UserAborted('delete-notelet-type-modal') when the modal is cancelled", async () => {
    const promise = invoke();
    openModal().cancel();
    const result = await promise;

    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("delete-notelet-type-modal");
  });

  it("refuses a type the journal does not have", async () => {
    const result = await harness
      .resolve(Flows)
      .invoke(DeleteNoteletTypeFlow, { journalName: "daily", typeId: "nt_missing" });

    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("pops the notelet-type subpage when it shows the deleted type", async () => {
    const ui = harness.resolve(SettingsUiService);
    ui.push(noteletTypeSubpage, { journalName: "daily", typeId: "nt_1" });
    const promise = invoke();
    openModal().submit({ mode: "keep" });
    await promise;

    expect(ui.current.value).toBeNull();
  });

  it("leaves another type's subpage on the stack untouched", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              notelets: {
                nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }),
                nt_2: buildNoteletType({ id: "nt_2" as TypeId, name: "Recipe" }),
              },
            },
          ),
        },
      },
    });
    const ui = harness.resolve(SettingsUiService);
    ui.push(noteletTypeSubpage, { journalName: "daily", typeId: "nt_2" });
    const promise = harness.resolve(Flows).invoke(DeleteNoteletTypeFlow, { journalName: "daily", typeId: "nt_1" });
    openModal().submit({ mode: "keep" });
    await promise;

    expect(ui.current.value?.subpage.key).toBe("notelet-type-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily", typeId: "nt_2" });
  });

  it("purges the type's notes before removing it from config", async () => {
    const repo = harness.resolve(JournalsRepository);
    const connection = harness.resolve(NoteConnectionService);
    const original = connection.disconnectNoteletsOfType.bind(connection);
    let typePresentDuringPurge: boolean | undefined;
    vi.spyOn(connection, "disconnectNoteletsOfType").mockImplementation((journalName: string, typeName: string) => {
      typePresentDuringPurge = repo.get(journalName).getOrUndefined()?.notelets.nt_1 !== undefined;
      return original(journalName, typeName);
    });

    const promise = invoke();
    openModal().submit({ mode: "clear" });
    await promise;

    expect(typePresentDuringPurge).toBe(true);
  });
});
