import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesRepository } from "../repository";
import { ShelvesService } from "../service";
import { ShelvesEventsToken } from "../tokens";

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
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(ShelvesEventsToken).useFactory(() => createNanoEvents());
  container.register(ShelvesRepository).useClass(ShelvesRepository);
  container.register(ShelvesService).useClass(ShelvesService);
  container.register(Flows).useClass(Flows);
  container.register(PlaceJournalFlow).useClass(PlaceJournalFlow);
  const shelvesRepo = container.resolve(ShelvesRepository);
  return { shelvesRepo, modals, flows: container.resolve(Flows) };
}

describe("PlaceJournalFlow", () => {
  it("assigns the journal to the chosen shelf", async () => {
    const { flows, modals, shelvesRepo } = await build();
    const promise = flows.invoke(PlaceJournalFlow, { journalName: "daily" });
    modals.lastOpen<unknown, string>().submit("Work");
    await promise;
    expect(shelvesRepo.get("Work").getOr(undefined as never)?.journals).toEqual(["daily"]);
  });

  it("leaves shelf membership unchanged when the modal is cancelled", async () => {
    const { flows, modals, shelvesRepo } = await build();
    const promise = flows.invoke(PlaceJournalFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(shelvesRepo.get("Work").getOr(undefined as never)?.journals).toEqual([]);
  });
});
