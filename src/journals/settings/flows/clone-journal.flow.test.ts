import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import {
  JournalLifecycleFlowError,
  JournalNameTakenError,
  JournalsRepository,
  UnknownJournalError,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { journalEditSubpage } from "../ui/journals-subpage";

import { CloneJournalFlow } from "./clone-journal.flow";

async function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(SubpageToken).useValue(journalEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  container.register(CloneJournalFlow).useClass(CloneJournalFlow);
  return {
    storage,
    modals,
    flows: container.resolve(Flows),
    ui: container.resolve(SettingsUiService),
  };
}

const daily = (): JournalConfig => ({ ...journalDefaultsFor({ type: "day" }, "daily"), folder: "Daily/" });

describe("CloneJournalFlow", () => {
  it("stores a copy of the source journal on submit", async () => {
    const { flows, modals, storage } = await build({ daily: daily() });
    const promise = flows.invoke(CloneJournalFlow, { journalName: "daily" });
    modals.lastOpen<unknown, { newName: string }>().submit({ newName: "daily copy" });
    await promise;
    expect(storage["daily copy"]).toEqual({ ...daily(), name: "daily copy" });
  });

  it("pushes the journal-edit subpage for the copy", async () => {
    const { flows, modals, ui } = await build({ daily: daily() });
    const promise = flows.invoke(CloneJournalFlow, { journalName: "daily" });
    modals.lastOpen<unknown, { newName: string }>().submit({ newName: "daily copy" });
    await promise;
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily copy" });
  });

  it("returns the new name on submit", async () => {
    const { flows, modals } = await build({ daily: daily() });
    const promise = flows.invoke(CloneJournalFlow, { journalName: "daily" });
    modals.lastOpen<unknown, { newName: string }>().submit({ newName: "daily copy" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ name: "daily copy" });
  });

  it("opens the modal with a free suggested name derived from the source", async () => {
    const { flows, modals } = await build({ daily: daily() });
    void flows.invoke(CloneJournalFlow, { journalName: "daily" });
    const opened = modals.lastOpen<{ sourceName: string; suggestedName: string }, { newName: string }>();
    expect(opened.props).toEqual({ sourceName: "daily", suggestedName: "daily (copy)" });
    opened.cancel();
  });

  it("numbers the suggested name past copies that already exist", async () => {
    const { flows, modals } = await build({
      daily: daily(),
      "daily (copy)": journalDefaultsFor({ type: "day" }, "daily (copy)"),
      "daily (copy) 2": journalDefaultsFor({ type: "day" }, "daily (copy) 2"),
    });
    void flows.invoke(CloneJournalFlow, { journalName: "daily" });
    const opened = modals.lastOpen<{ sourceName: string; suggestedName: string }, { newName: string }>();
    expect(opened.props.suggestedName).toBe("daily (copy) 3");
    opened.cancel();
  });

  it("returns UserAborted('clone-journal-modal') when the modal is cancelled", async () => {
    const { flows, modals } = await build({ daily: daily() });
    const promise = flows.invoke(CloneJournalFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("clone-journal-modal");
  });

  it("maps a name-taken error to JournalLifecycleFlowError", async () => {
    const { flows, modals } = await build({
      daily: daily(),
      weekly: journalDefaultsFor({ type: "week" }, "weekly"),
    });
    const promise = flows.invoke(CloneJournalFlow, { journalName: "daily" });
    modals.lastOpen<unknown, { newName: string }>().submit({ newName: "weekly" });
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      JournalNameTakenError,
    );
  });

  it("fails without opening a modal when the source journal is gone", async () => {
    const { flows, modals } = await build();
    const result = await flows.invoke(CloneJournalFlow, { journalName: "daily" });
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
    expect(modals.opens).toHaveLength(0);
  });
});
