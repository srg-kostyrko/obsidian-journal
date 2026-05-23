import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleFlowError, UnknownJournalError } from "@/journals/errors";
import { createSettingsService } from "@/settings/testing";

import { JournalLifecycleService } from "../lifecycle";

import { RenameJournalFlow } from "./rename-journal.flow";

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
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(Flows).useClass(Flows);
  container.register(RenameJournalFlow).useClass(RenameJournalFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("RenameJournalFlow", () => {
  it("renames the journal in the collection on submit", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(RenameJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    await promise;
    const collection = settings.getCollection(journalConfigCollection);
    expect(collection.get("daily")).toBeUndefined();
    expect(collection.get("morning")?.name).toBe("morning");
  });

  it("returns the new name on submit", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals } = await build(raw);
    const promise = flows.invoke(RenameJournalFlow, { journalName: "daily" });
    modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "morning" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ newName: "morning" });
  });

  it("returns UserAborted('rename-journal-modal') when the modal is cancelled", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals } = await build(raw);
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
