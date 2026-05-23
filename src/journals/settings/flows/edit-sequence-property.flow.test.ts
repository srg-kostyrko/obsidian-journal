import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleFlowError, UnknownJournalError, UnknownSequenceSourceError } from "@/journals/errors";
import { createSettingsService } from "@/settings/testing";

import { EditSequencePropertyFlow } from "./edit-sequence-property.flow";

function makeJournalConfig(name: string, withSource = true) {
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
    numbering: {
      enabled: true,
      anchorDate: "2024-01-01",
      allowBefore: false,
      sources: withSource
        ? [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" as const } }]
        : [],
    },
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
  container.register(Flows).useClass(Flows);
  container.register(EditSequencePropertyFlow).useClass(EditSequencePropertyFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("EditSequencePropertyFlow", () => {
  it("mutates sources[sourceIndex].frontmatterKey on submit", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "sprint-no" });
    await promise;
    expect(settings.getCollection(journalConfigCollection).get("daily")?.numbering.sources[0]?.frontmatterKey).toBe(
      "sprint-no",
    );
  });

  it("returns the new value on submit", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals } = await build(raw);
    const promise = flows.invoke(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "issue-no" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ newValue: "issue-no" });
  });

  it("returns UserAborted('edit-sequence-property-modal') when cancelled", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals } = await build(raw);
    const promise = flows.invoke(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("edit-sequence-property-modal");
  });

  it("rejects when the journal does not exist", async () => {
    const { flows } = await build();
    const result = await flows.invoke(EditSequencePropertyFlow, { journalName: "ghost", sourceIndex: 0 });
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });

  it("rejects when the source index is out of range", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily", false) } };
    const { flows } = await build(raw);
    const result = await flows.invoke(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownSequenceSourceError,
    );
  });
});
