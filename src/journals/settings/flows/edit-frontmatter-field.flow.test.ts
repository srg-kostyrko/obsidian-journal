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
import { createSettingsService } from "@/settings/testing";

import { EditFrontmatterFieldFlow } from "./edit-frontmatter-field.flow";

async function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  const connection = { renameFieldAll: vi.fn(() => AsyncResult.ok()) };
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(NoteConnectionService).useValue(connection as unknown as NoteConnectionService);
  container.register(Flows).useClass(Flows);
  container.register(EditFrontmatterFieldFlow).useClass(EditFrontmatterFieldFlow);
  return { storage, repo, modals, connection, flows: container.resolve(Flows) };
}

describe("EditFrontmatterFieldFlow", () => {
  it("updates dateField on submit", async () => {
    const { flows, modals, repo } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "happened-on" });
    await promise;
    expect(repo.get("daily").getOr(undefined as never).frontmatter.dateField).toBe("happened-on");
  });

  it("updates startDateField on submit", async () => {
    const { flows, modals, repo } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "startDateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "begins-on" });
    await promise;
    expect(repo.get("daily").getOr(undefined as never).frontmatter.startDateField).toBe("begins-on");
  });

  it("updates endDateField on submit", async () => {
    const { flows, modals, repo } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "endDateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "ends-on" });
    await promise;
    expect(repo.get("daily").getOr(undefined as never).frontmatter.endDateField).toBe("ends-on");
  });

  it("moves note frontmatter from the old date-field key to the new one", async () => {
    const { flows, modals, connection } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "happened-on" });
    await promise;
    expect(connection.renameFieldAll).toHaveBeenCalledWith("daily", "journal-date", "happened-on");
  });

  it("moves note frontmatter from the old start-date key to the new one", async () => {
    const { flows, modals, connection } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "startDateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "begins-on" });
    await promise;
    expect(connection.renameFieldAll).toHaveBeenCalledWith("daily", "journal-start-date", "begins-on");
  });

  it("does not move note frontmatter when the date field is unchanged", async () => {
    const { flows, modals, connection } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "journal-date" });
    await promise;
    expect(connection.renameFieldAll).not.toHaveBeenCalled();
  });

  it("returns the new value on submit", async () => {
    const { flows, modals } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "x" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ newValue: "x" });
  });

  it("returns UserAborted('edit-frontmatter-field-modal') when cancelled", async () => {
    const { flows, modals } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("edit-frontmatter-field-modal");
  });

  it("rejects when the journal does not exist", async () => {
    const { flows } = await build();
    const result = await flows.invoke(EditFrontmatterFieldFlow, { journalName: "ghost", fieldName: "dateField" });
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });
});
