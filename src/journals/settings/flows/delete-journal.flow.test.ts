import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleFlowError, UnknownJournalError } from "@/journals/errors";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { JournalLifecycleService } from "../lifecycle";
import { journalEditSubpage } from "../ui/journals-subpage";

import { DeleteJournalFlow } from "./delete-journal.flow";

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
  container.register(DeleteJournalFlow).useClass(DeleteJournalFlow);
  return {
    settings,
    modals,
    flows: container.resolve(Flows),
    ui: container.resolve(SettingsUiService),
  };
}

describe("DeleteJournalFlow", () => {
  it("removes the journal from the collection on submit", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" }>().submit({ mode: "keep" });
    await promise;
    expect(settings.getCollection(journalConfigCollection).get("daily")).toBeUndefined();
  });

  it("pops the edit subpage when it shows the deleted journal", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals, ui } = await build(raw);
    ui.push(journalEditSubpage, { journalName: "daily" });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" }>().submit({ mode: "keep" });
    await promise;
    expect(ui.current.value).toBeNull();
  });

  it("leaves another journal's subpage on the stack untouched", async () => {
    const raw = {
      version: 3,
      journals: { daily: makeJournalConfig("daily"), morning: makeJournalConfig("morning") },
    };
    const { flows, modals, ui } = await build(raw);
    ui.push(journalEditSubpage, { journalName: "morning" });
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" }>().submit({ mode: "keep" });
    await promise;
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "morning" });
  });

  it("returns UserAborted('delete-journal-modal') when the modal is cancelled", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals } = await build(raw);
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("delete-journal-modal");
  });

  it("maps unknown-journal errors to JournalLifecycleFlowError", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(DeleteJournalFlow, { journalName: "ghost" });
    modals.lastOpen<{ journalName: string }, { mode: "keep" }>().submit({ mode: "keep" });
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });
});
