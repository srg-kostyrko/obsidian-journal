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
import { SettingsUiService } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";
import { journalEditSubpage } from "../ui/journals-subpage";
import { journalsSettingsUiModule } from "../ui-module";

import { DeleteJournalFlow } from "./delete-journal.flow";

describe("DeleteJournalFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
  });

  it("removes the journal from storage on submit", async () => {
    const promise = harness.resolve(Flows).invoke(DeleteJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({
      mode: "keep",
    });
    await promise;
    expect(harness.resolve(JournalsRepository).get("daily").isNone()).toBe(true);
  });

  it("pops the edit subpage when it shows the deleted journal", async () => {
    const ui = harness.resolve(SettingsUiService);
    ui.push(journalEditSubpage, { journalName: "daily" });
    const promise = harness.resolve(Flows).invoke(DeleteJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({
      mode: "keep",
    });
    await promise;
    expect(ui.current.value).toBeNull();
  });

  it("leaves another journal's subpage on the stack untouched", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          morning: fixedJournal("morning", { type: "day" }),
        },
      },
    });
    const ui = harness.resolve(SettingsUiService);
    ui.push(journalEditSubpage, { journalName: "morning" });
    const promise = harness.resolve(Flows).invoke(DeleteJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({
      mode: "keep",
    });
    await promise;
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "morning" });
  });

  it("returns UserAborted('delete-journal-modal') when the modal is cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(DeleteJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("delete-journal-modal");
  });

  it("maps unknown-journal errors to JournalLifecycleFlowError", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule],
    });
    const promise = harness.resolve(Flows).invoke(DeleteJournalFlow, { journalName: "ghost" });
    harness.modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({
      mode: "keep",
    });
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });

  it("routes clear mode to disconnectAll", async () => {
    const path = "2026-06-01.md" as VaultPath;
    harness.host.putFile(path, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });
    const promise = harness.resolve(Flows).invoke(DeleteJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({
      mode: "clear",
    });
    await promise;
    expect(harness.host.files.get(path)?.frontmatter).toEqual({ title: "keep" });
    expect(harness.host.files.has(path)).toBe(true);
  });

  it("routes delete mode to deleteAll", async () => {
    const path = "2026-06-01.md" as VaultPath;
    harness.host.putFile(path, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });
    const promise = harness.resolve(Flows).invoke(DeleteJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({
      mode: "delete",
    });
    await promise;
    expect(harness.host.files.has(path)).toBe(false);
  });

  it("leaves connected notes untouched when mode is keep", async () => {
    const path = "2026-06-01.md" as VaultPath;
    harness.host.putFile(path, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });
    const promise = harness.resolve(Flows).invoke(DeleteJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({
      mode: "keep",
    });
    await promise;
    expect(harness.host.files.has(path)).toBe(true);
    expect(harness.host.files.get(path)?.frontmatter).toEqual({
      journal: "daily",
      "journal-date": "2026-06-01",
      title: "keep",
    });
  });

  it("purges connected notes before removing the journal config", async () => {
    const path = "2026-06-01.md" as VaultPath;
    harness.host.putFile(path, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });
    const connection = harness.resolve(NoteConnectionService);
    const repo = harness.resolve(JournalsRepository);
    const original = connection.disconnectAll.bind(connection);
    let configPresentDuringPurge: boolean | undefined;
    vi.spyOn(connection, "disconnectAll").mockImplementation((journalName: string) => {
      configPresentDuringPurge = repo.get(journalName).isSome();
      return original(journalName);
    });
    const promise = harness.resolve(Flows).invoke(DeleteJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({
      mode: "clear",
    });
    await promise;
    expect(configPresentDuringPurge).toBe(true);
  });
});
