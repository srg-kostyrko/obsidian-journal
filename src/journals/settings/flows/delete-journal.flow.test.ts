import { createNanoEvents } from "nanoevents";
import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
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
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { journalEditSubpage } from "../ui/journals-subpage";

import { DeleteJournalFlow } from "./delete-journal.flow";

async function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  const connection = {
    disconnectAll: vi.fn((_journalName: string) => AsyncResult.ok()),
    deleteAll: vi.fn((_journalName: string) => AsyncResult.ok()),
  };
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(NoteConnectionService).useValue(connection as unknown as NoteConnectionService);
  container.register(SubpageToken).useValue(journalEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  container.register(DeleteJournalFlow).useClass(DeleteJournalFlow);
  return {
    storage,
    modals,
    connection,
    flows: container.resolve(Flows),
    ui: container.resolve(SettingsUiService),
  };
}

describe("DeleteJournalFlow", () => {
  it("removes the journal from storage on submit", async () => {
    const { flows, modals, storage } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "keep" });
    await promise;
    expect(storage.daily).toBeUndefined();
  });

  it("pops the edit subpage when it shows the deleted journal", async () => {
    const { flows, modals, ui } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    ui.push(journalEditSubpage, { journalName: "daily" });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "keep" });
    await promise;
    expect(ui.current.value).toBeNull();
  });

  it("leaves another journal's subpage on the stack untouched", async () => {
    const { flows, modals, ui } = await build({
      daily: journalDefaultsFor({ type: "day" }, "daily"),
      morning: journalDefaultsFor({ type: "day" }, "morning"),
    });
    ui.push(journalEditSubpage, { journalName: "morning" });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "keep" });
    await promise;
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "morning" });
  });

  it("returns UserAborted('delete-journal-modal') when the modal is cancelled", async () => {
    const { flows, modals } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("delete-journal-modal");
  });

  it("maps unknown-journal errors to JournalLifecycleFlowError", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "ghost" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "keep" });
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });

  it("routes clear mode to disconnectAll", async () => {
    const { flows, modals, connection } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "clear" });
    await promise;
    expect(connection.disconnectAll).toHaveBeenCalledWith("daily");
    expect(connection.deleteAll).not.toHaveBeenCalled();
  });

  it("routes delete mode to deleteAll", async () => {
    const { flows, modals, connection } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "delete" });
    await promise;
    expect(connection.deleteAll).toHaveBeenCalledWith("daily");
    expect(connection.disconnectAll).not.toHaveBeenCalled();
  });

  it("leaves connected notes untouched when mode is keep", async () => {
    const { flows, modals, connection } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "keep" });
    await promise;
    expect(connection.disconnectAll).not.toHaveBeenCalled();
    expect(connection.deleteAll).not.toHaveBeenCalled();
  });

  it("purges connected notes before removing the journal config", async () => {
    const { flows, modals, connection, storage } = await build({
      daily: journalDefaultsFor({ type: "day" }, "daily"),
    });
    let configPresentDuringPurge: boolean | undefined;
    connection.disconnectAll.mockImplementation((journalName: string) => {
      configPresentDuringPurge = storage[journalName] !== undefined;
      return AsyncResult.ok();
    });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" | "clear" | "delete" }>().submit({ mode: "clear" });
    await promise;
    expect(configPresentDuringPurge).toBe(true);
  });
});
