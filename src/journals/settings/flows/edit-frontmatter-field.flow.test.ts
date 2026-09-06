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
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";

import { EditFrontmatterFieldFlow } from "./edit-frontmatter-field.flow";

describe("EditFrontmatterFieldFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
  });

  it("updates dateField on submit", async () => {
    const promise = harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "dateField",
    });
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "happened-on" });
    await promise;
    expect(harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.frontmatter.dateField).toBe(
      "happened-on",
    );
  });

  it("updates startDateField on submit", async () => {
    const promise = harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "startDateField",
    });
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "begins-on" });
    await promise;
    expect(harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.frontmatter.startDateField).toBe(
      "begins-on",
    );
  });

  it("updates endDateField on submit", async () => {
    const promise = harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "endDateField",
    });
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "ends-on" });
    await promise;
    expect(harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.frontmatter.endDateField).toBe("ends-on");
  });

  it("moves note frontmatter from the old date-field key to the new one", async () => {
    const path = "2026-06-01.md" as VaultPath;
    harness.host.putFile(path, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });
    const promise = harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "dateField",
    });
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "happened-on" });
    await promise;
    expect(harness.host.files.get(path)?.frontmatter).toEqual({
      journal: "daily",
      "happened-on": "2026-06-01",
      title: "keep",
    });
  });

  it("moves note frontmatter from the old start-date key to the new one", async () => {
    const path = "2026-06-01.md" as VaultPath;
    harness.host.putFile(path, "content", {
      journal: "daily",
      "journal-date": "2026-06-01",
      "journal-start-date": "2026-06-01",
      title: "keep",
    });
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });
    const promise = harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "startDateField",
    });
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "begins-on" });
    await promise;
    expect(harness.host.files.get(path)?.frontmatter).toEqual({
      journal: "daily",
      "journal-date": "2026-06-01",
      "begins-on": "2026-06-01",
      title: "keep",
    });
  });

  it("does not move note frontmatter when the date field is unchanged", async () => {
    const connection = harness.resolve(NoteConnectionService);
    const spy = vi.spyOn(connection, "renameJournalFieldAll");
    const promise = harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "dateField",
    });
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "journal-date" });
    await promise;
    expect(spy).not.toHaveBeenCalled();
  });

  it("moves a renamed date field on notelets as well as period notes", async () => {
    const periodPath = "2026-06-01.md" as VaultPath;
    const noteletPath = "Standup 1.md" as VaultPath;
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule],
      data: {
        journals: {
          daily: {
            ...fixedJournal("daily", { type: "day" }),
            notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) },
          },
        },
      },
    });
    harness.host.putFile(periodPath, "content", { journal: "daily", "journal-date": "2026-06-01" });
    harness.host.putFile(noteletPath, "content", {
      journal: "daily",
      "journal-date": "2026-06-01",
      "journal-notelet": "Standup",
      "journal-notelet-index": 1,
    });
    const index = harness.resolve(JournalsIndex);
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: periodPath });
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-06-01"),
      path: noteletPath,
      typeName: "Standup",
      typeId: "nt_1" as TypeId,
      counter: 1,
    });

    const promise = harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "dateField",
    });
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "on" });
    await promise;

    expect(harness.host.files.get(periodPath)?.frontmatter).toMatchObject({ on: "2026-06-01" });
    expect(harness.host.files.get(noteletPath)?.frontmatter).toMatchObject({ on: "2026-06-01" });
  });

  it("renames the type key across the journal's notelets", async () => {
    const periodPath = "2026-06-01.md" as VaultPath;
    const noteletPath = "Standup 1.md" as VaultPath;
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule],
      data: {
        journals: {
          daily: {
            ...fixedJournal("daily", { type: "day" }),
            notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) },
          },
        },
      },
    });
    harness.host.putFile(periodPath, "content", { journal: "daily", "journal-date": "2026-06-01" });
    harness.host.putFile(noteletPath, "content", {
      journal: "daily",
      "journal-date": "2026-06-01",
      "journal-notelet": "Standup",
      "journal-notelet-index": 1,
    });
    const index = harness.resolve(JournalsIndex);
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: periodPath });
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-06-01"),
      path: noteletPath,
      typeName: "Standup",
      typeId: "nt_1" as TypeId,
      counter: 1,
    });

    const promise = harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "noteletField",
    });
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "kind" });
    await promise;

    expect(harness.host.files.get(noteletPath)?.frontmatter).toMatchObject({ kind: "Standup" });
    expect(harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.frontmatter.noteletField).toBe("kind");
  });

  it("returns the new value on submit", async () => {
    const promise = harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "dateField",
    });
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "x" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ newValue: "x" });
  });

  it("returns UserAborted('edit-frontmatter-field-modal') when cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "dateField",
    });
    harness.modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("edit-frontmatter-field-modal");
  });

  it("rejects when the journal does not exist", async () => {
    harness = await testContainer({ modules: [journalsCoreModule, journalsSettingsCoreModule] });
    const result = await harness.resolve(Flows).invoke(EditFrontmatterFieldFlow, {
      journalName: "ghost",
      fieldName: "dateField",
    });
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });
});
