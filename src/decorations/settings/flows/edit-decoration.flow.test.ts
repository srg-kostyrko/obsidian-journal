import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import type { JournalDecoration } from "@/decorations";
import { DecorationLifecycleFlowError, UnknownDecorationError } from "@/decorations/errors";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import {
  JournalLifecycleFlowError,
  JournalsRepository,
  UnknownJournalError,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { EditDecorationFlow } from "./edit-decoration.flow";

function buildJournal(name: string, decorations: JournalDecoration[]): JournalConfig {
  return { ...journalDefaultsFor({ type: "day" }, name), decorations };
}

function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(Flows).useClass(Flows);
  container.register(EditDecorationFlow).useClass(EditDecorationFlow);
  return { storage, modals, flows: container.resolve(Flows) };
}

const sampleDecoration: JournalDecoration = {
  mode: "and",
  conditions: [{ type: "has-note" }],
  styles: [{ type: "background", color: { type: "transparent" } }],
};

describe("EditDecorationFlow", () => {
  it("returns UnknownJournalError when the journal does not exist", async () => {
    const { flows } = build();
    const result = await flows.invoke(EditDecorationFlow, { journalName: "missing" });
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });

  it("returns UnknownDecorationError for an out-of-range edit index", async () => {
    const { flows } = build({ daily: buildJournal("daily", []) });
    const result = await flows.invoke(EditDecorationFlow, { journalName: "daily", index: 5 });
    expect(result.kind === "err" && result.error).toBeInstanceOf(DecorationLifecycleFlowError);
    expect(result.kind === "err" && (result.error as DecorationLifecycleFlowError).cause).toBeInstanceOf(
      UnknownDecorationError,
    );
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = build({ daily: buildJournal("daily", []) });
    const promise = flows.invoke(EditDecorationFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("appends and returns the new index when no index is provided", async () => {
    const { flows, modals, storage } = build({ daily: buildJournal("daily", [sampleDecoration]) });
    const promise = flows.invoke(EditDecorationFlow, { journalName: "daily" });
    modals
      .lastOpen<{ journalName: string }, { decoration: JournalDecoration }>()
      .submit({ decoration: sampleDecoration });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(1);
    expect(storage.daily?.decorations.length).toBe(2);
  });

  it("replaces the decoration at index when an index is provided", async () => {
    const updated: JournalDecoration = { ...sampleDecoration, mode: "or" };
    const { flows, modals, storage } = build({ daily: buildJournal("daily", [sampleDecoration]) });
    const promise = flows.invoke(EditDecorationFlow, { journalName: "daily", index: 0 });
    modals.lastOpen<{ journalName: string }, { decoration: JournalDecoration }>().submit({ decoration: updated });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(0);
    expect(storage.daily?.decorations[0]).toEqual(updated);
  });
});
