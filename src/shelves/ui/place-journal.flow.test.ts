import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesLifecycleService } from "../lifecycle";

import { PlaceJournalFlow } from "./place-journal.flow";

function makeJournal(name: string) {
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
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
  };
}

async function build() {
  const raw = {
    version: 3,
    journals: { daily: makeJournal("daily") },
    shelves: { Work: { name: "Work", journals: [] } },
  };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService);
  container.register(Flows).useClass(Flows);
  container.register(PlaceJournalFlow).useClass(PlaceJournalFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("PlaceJournalFlow", () => {
  it("assigns the journal to the chosen shelf", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(PlaceJournalFlow, { journalName: "daily" });
    modals.lastOpen<unknown, string>().submit("Work");
    await promise;
    expect(settings.getCollection(shelvesCollection).get("Work")?.journals).toEqual(["daily"]);
  });

  it("leaves shelf membership unchanged when the modal is cancelled", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(PlaceJournalFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(settings.getCollection(shelvesCollection).get("Work")?.journals).toEqual([]);
  });
});
