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
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { journalEditSubpage } from "../ui/journals-subpage";

import { AddJournalFlow } from "./add-journal.flow";

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
  container.register(AddJournalFlow).useClass(AddJournalFlow);
  return {
    storage,
    modals,
    flows: container.resolve(Flows),
    ui: container.resolve(SettingsUiService),
  };
}

describe("AddJournalFlow", () => {
  it("creates the journal in storage on submit", async () => {
    const { flows, modals, storage } = await build();
    const promise = flows.invoke(AddJournalFlow, undefined);
    modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({ name: "daily", write: { type: "day" } });
    await promise;
    expect(storage.daily?.name).toBe("daily");
  });

  it("pushes the journal-edit subpage on submit", async () => {
    const { flows, modals, ui } = await build();
    const promise = flows.invoke(AddJournalFlow, undefined);
    modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({ name: "daily", write: { type: "day" } });
    await promise;
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily" });
  });

  it("returns the created name on submit", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddJournalFlow, undefined);
    modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({ name: "daily", write: { type: "day" } });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ name: "daily" });
  });

  it("returns UserAborted('add-journal-modal') when the modal is cancelled", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddJournalFlow, undefined);
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("add-journal-modal");
  });

  it("maps a name-taken error to JournalLifecycleFlowError", async () => {
    const { flows, modals } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(AddJournalFlow, undefined);
    modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({ name: "daily", write: { type: "day" } });
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      JournalNameTakenError,
    );
  });
});
