import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleFlowError, UnknownJournalError } from "@/journals/errors";
import { createSettingsService } from "@/settings/testing";

import { EditFrontmatterFieldFlow } from "./edit-frontmatter-field.flow";

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
  container.register(Flows).useClass(Flows);
  container.register(EditFrontmatterFieldFlow).useClass(EditFrontmatterFieldFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("EditFrontmatterFieldFlow", () => {
  it("mutates dateField on submit", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "happened-on" });
    await promise;
    expect(settings.getCollection(journalConfigCollection).get("daily")?.frontmatter.dateField).toBe("happened-on");
  });

  it("mutates startDateField on submit", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "startDateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "begins-on" });
    await promise;
    expect(settings.getCollection(journalConfigCollection).get("daily")?.frontmatter.startDateField).toBe("begins-on");
  });

  it("mutates endDateField on submit", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "endDateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "ends-on" });
    await promise;
    expect(settings.getCollection(journalConfigCollection).get("daily")?.frontmatter.endDateField).toBe("ends-on");
  });

  it("returns the new value on submit", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals } = await build(raw);
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "x" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ newValue: "x" });
  });

  it("returns UserAborted('edit-frontmatter-field-modal') when cancelled", async () => {
    const raw = { version: 3, journals: { daily: makeJournalConfig("daily") } };
    const { flows, modals } = await build(raw);
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
