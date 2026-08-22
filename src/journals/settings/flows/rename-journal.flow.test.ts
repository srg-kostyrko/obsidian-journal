import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { JournalLifecycleFlowError, UnknownJournalError } from "@/journals/errors";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";

import { RenameJournalFlow } from "./rename-journal.flow";

describe("RenameJournalFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
  });

  it("renames the journal in storage on submit", async () => {
    const promise = harness.resolve(Flows).invoke(RenameJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    await promise;
    const repo = harness.resolve(JournalsRepository);
    expect(repo.get("daily").isNone()).toBe(true);
    expect(repo.get("morning").getOrUndefined()?.name).toBe("morning");
  });

  it("returns the new name on submit", async () => {
    const promise = harness.resolve(Flows).invoke(RenameJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ newName: "morning" });
  });

  it("rewrites connected notes' journal frontmatter to the new name", async () => {
    const path = "2026-06-01.md" as VaultPath;
    harness.host.putFile(path, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });
    const promise = harness.resolve(Flows).invoke(RenameJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    await promise;
    expect(harness.host.files.get(path)?.frontmatter).toEqual({
      journal: "morning",
      "journal-date": "2026-06-01",
      title: "keep",
    });
  });

  it("leaves connected notes untouched when the rename is rejected", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          morning: fixedJournal("morning", { type: "day" }),
        },
      },
    });
    const connection = harness.resolve(NoteConnectionService);
    const spy = vi.spyOn(connection, "reconnectAll");
    const promise = harness.resolve(Flows).invoke(RenameJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    await promise;
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns UserAborted('rename-journal-modal') when the modal is cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(RenameJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("rename-journal-modal");
  });

  it("maps unknown-journal errors to JournalLifecycleFlowError", async () => {
    harness = await testContainer({ modules: [journalsCoreModule, journalsSettingsCoreModule] });
    const promise = harness.resolve(Flows).invoke(RenameJournalFlow, { journalName: "ghost" });
    harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "x" });
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });
});
