import { createNanoEvents } from "nanoevents";
import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import {
  JournalLifecycleFlowError,
  JournalsRepository,
  UnknownJournalError,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { createSettingsService } from "@/settings/testing";

import { RenameJournalFlow } from "./rename-journal.flow";

async function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  const connection = {
    reconnectAll: vi.fn((_oldName: string, _newName: string) => AsyncResult.ok()),
  };
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(NoteConnectionService).useValue(connection as unknown as NoteConnectionService);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  container.register(RenameJournalFlow).useClass(RenameJournalFlow);
  return { storage, modals, connection, flows: container.resolve(Flows) };
}

describe("RenameJournalFlow", () => {
  it("renames the journal in storage on submit", async () => {
    const { flows, modals, storage } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(RenameJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    await promise;
    expect(storage.daily).toBeUndefined();
    expect(storage.morning?.name).toBe("morning");
  });

  it("returns the new name on submit", async () => {
    const { flows, modals } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(RenameJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ newName: "morning" });
  });

  it("rewrites connected notes' journal frontmatter to the new name", async () => {
    const { flows, modals, connection } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(RenameJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    await promise;
    expect(connection.reconnectAll).toHaveBeenCalledWith("daily", "morning");
  });

  it("leaves connected notes untouched when the rename is rejected", async () => {
    const { flows, modals, connection } = await build({
      daily: journalDefaultsFor({ type: "day" }, "daily"),
      morning: journalDefaultsFor({ type: "day" }, "morning"),
    });
    const promise = flows.invoke(RenameJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    await promise;
    expect(connection.reconnectAll).not.toHaveBeenCalled();
  });

  it("returns UserAborted('rename-journal-modal') when the modal is cancelled", async () => {
    const { flows, modals } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(RenameJournalFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("rename-journal-modal");
  });

  it("maps unknown-journal errors to JournalLifecycleFlowError", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(RenameJournalFlow, { journalName: "ghost" });
    modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "x" });
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });
});
