import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleFlowError, JournalNameTakenError } from "@/journals/errors";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { JournalLifecycleService } from "../lifecycle";
import { journalEditSubpage } from "../ui/journals-subpage";

import { AddJournalFlow } from "./add-journal.flow";

function makeJournalConfig(name: string) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "2024-01-01", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
  };
}

async function build(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(SubpageToken).useValue(journalEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(Flows).useClass(Flows);
  container.register(AddJournalFlow).useClass(AddJournalFlow);
  return {
    settings,
    modals,
    flows: container.resolve(Flows),
    ui: container.resolve(SettingsUiService),
  };
}

describe("AddJournalFlow", () => {
  it("creates the journal in the collection on submit", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(AddJournalFlow, undefined);
    modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({ name: "daily", write: { type: "day" } });
    await promise;
    expect(settings.getCollection(journalConfigCollection).get("daily")?.name).toBe("daily");
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

  it("maps a lifecycle name-taken error to JournalLifecycleFlowError", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals } = await build(raw);
    const promise = flows.invoke(AddJournalFlow, undefined);
    modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({ name: "daily", write: { type: "day" } });
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      JournalNameTakenError,
    );
  });
});
