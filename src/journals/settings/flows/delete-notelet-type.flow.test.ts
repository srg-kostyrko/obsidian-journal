import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { commandsCoreModule } from "@/commands/module";
import { CommandsRepository } from "@/commands/repository";
import { buildCommand } from "@/commands/testing";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { JournalLifecycleFlowError, UnknownJournalError } from "@/journals/errors";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
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
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule, commandsCoreModule],
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

  it.each(["keep", "clear", "delete"] as const)("leaves another type's notelets untouched in mode=%s", async (mode) => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule, commandsCoreModule],
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
    openModal().submit({ mode });
    await promise;

    expect(harness.host.files.has(recipePath)).toBe(true);
    expect(harness.host.files.get(recipePath)?.frontmatter).toMatchObject({ "journal-notelet": "Recipe" });
  });

  it("retires the type's command, whose typeId would otherwise resolve to nothing", async () => {
    const commands = harness.resolve(CommandsRepository);
    commands.create("cmd-1", buildCommand({ target: { kind: "notelet", journalName: "daily", typeId: "nt_1" } }));
    commands.create("cmd-2", buildCommand({ target: { kind: "notelet", journalName: "daily", typeId: "nt_2" } }));

    const promise = invoke();
    openModal().submit({ mode: "keep" });
    await promise;

    expect(commands.get("cmd-1").isNone()).toBe(true);
    expect(commands.get("cmd-2").isSome()).toBe(true);
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
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule, commandsCoreModule],
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

  // A deleted type's id left behind in a has-notelet condition can only match nothing, but the
  // condition still reads as naming a type. Stripping it is only safe while the list keeps at
  // least one other id: an emptied list means "any type" to the engine, which would widen the
  // rule instead of narrowing it. So an emptied condition goes, and a decoration the deletion
  // left with no conditions goes with it.
  function decorate(decorations: ReturnType<typeof buildDecoration>[]): void {
    harness.resolve(JournalsRepository).update("daily", { decorations });
  }

  function decorationsAfterDelete() {
    return harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.decorations;
  }

  it("drops the deleted id from a has-notelet condition that names other types too", async () => {
    decorate([
      buildDecoration({
        conditions: [buildCondition("has-notelet", { typeIds: ["nt_1", "nt_2"] })],
        styles: [buildStyle("background")],
      }),
    ]);

    const promise = invoke();
    openModal().submit({ mode: "keep" });
    await promise;

    expect(decorationsAfterDelete()).toMatchObject([{ conditions: [{ type: "has-notelet", typeIds: ["nt_2"] }] }]);
  });

  it("drops a has-notelet condition the deleted id was the only member of, keeping its siblings", async () => {
    decorate([
      buildDecoration({
        conditions: [
          buildCondition("has-notelet", { typeIds: ["nt_1"] }),
          buildCondition("title", { condition: "contains", value: "keep me" }),
        ],
        styles: [buildStyle("background")],
      }),
    ]);

    const promise = invoke();
    openModal().submit({ mode: "keep" });
    await promise;

    expect(decorationsAfterDelete()).toMatchObject([{ conditions: [{ type: "title", value: "keep me" }] }]);
  });

  it("drops a decoration whose only condition the deletion emptied", async () => {
    decorate([
      buildDecoration({
        conditions: [buildCondition("has-notelet", { typeIds: ["nt_1"] })],
        styles: [buildStyle("background")],
      }),
      buildDecoration({
        conditions: [buildCondition("title", { condition: "contains", value: "survivor" })],
        styles: [buildStyle("background")],
      }),
    ]);

    const promise = invoke();
    openModal().submit({ mode: "keep" });
    await promise;

    expect(decorationsAfterDelete()).toMatchObject([{ conditions: [{ type: "title", value: "survivor" }] }]);
  });

  it("leaves an any-type has-notelet condition alone", async () => {
    decorate([
      buildDecoration({
        conditions: [buildCondition("has-notelet", { typeIds: [] })],
        styles: [buildStyle("background")],
      }),
    ]);

    const promise = invoke();
    openModal().submit({ mode: "keep" });
    await promise;

    expect(decorationsAfterDelete()).toMatchObject([{ conditions: [{ type: "has-notelet", typeIds: [] }] }]);
  });

  it("leaves a decoration that already had no conditions alone", async () => {
    decorate([buildDecoration({ conditions: [], styles: [buildStyle("background")] })]);

    const promise = invoke();
    openModal().submit({ mode: "keep" });
    await promise;

    expect(decorationsAfterDelete()).toHaveLength(1);
  });

  it("leaves another journal's has-notelet condition on the same id alone", async () => {
    const repo = harness.resolve(JournalsRepository);
    repo.create("other", { type: "day" });
    repo.update("other", {
      decorations: [
        buildDecoration({
          conditions: [buildCondition("has-notelet", { typeIds: ["nt_1"] })],
          styles: [buildStyle("background")],
        }),
      ],
    });

    const promise = invoke();
    openModal().submit({ mode: "keep" });
    await promise;

    expect(repo.get("other").getOrUndefined()?.decorations).toMatchObject([
      { conditions: [{ type: "has-notelet", typeIds: ["nt_1"] }] },
    ]);
  });
});
