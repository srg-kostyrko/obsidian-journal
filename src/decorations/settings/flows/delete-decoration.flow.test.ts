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

import { DeleteDecorationFlow } from "./delete-decoration.flow";

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
  container.register(DeleteDecorationFlow).useClass(DeleteDecorationFlow);
  return { storage, modals, flows: container.resolve(Flows) };
}

const sampleDecoration: JournalDecoration = {
  mode: "and",
  conditions: [{ type: "has-note" }],
  styles: [{ type: "background", color: { type: "transparent" } }],
};

describe("DeleteDecorationFlow", () => {
  it("returns UnknownJournalError when the journal does not exist", async () => {
    const { flows } = build();
    const result = await flows.invoke(DeleteDecorationFlow, { journalName: "missing", index: 0 });
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });

  it("returns UnknownDecorationError when the index is out of range", async () => {
    const { flows } = build({ daily: buildJournal("daily", []) });
    const result = await flows.invoke(DeleteDecorationFlow, { journalName: "daily", index: 0 });
    expect(result.kind === "err" && result.error).toBeInstanceOf(DecorationLifecycleFlowError);
    expect(result.kind === "err" && (result.error as DecorationLifecycleFlowError).cause).toBeInstanceOf(
      UnknownDecorationError,
    );
  });

  it("returns UserAborted when the user cancels", async () => {
    const { flows, modals } = build({ daily: buildJournal("daily", [sampleDecoration]) });
    const promise = flows.invoke(DeleteDecorationFlow, { journalName: "daily", index: 0 });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("removes the decoration when the user confirms", async () => {
    const { flows, modals, storage } = build({ daily: buildJournal("daily", [sampleDecoration]) });
    const promise = flows.invoke(DeleteDecorationFlow, { journalName: "daily", index: 0 });
    modals.lastOpen<{ journalName: string }, { confirmed: true }>().submit({ confirmed: true });
    const result = await promise;
    expect(result.kind === "ok" && result.value.deleted).toEqual(sampleDecoration);
    expect(storage.daily?.decorations).toEqual([]);
  });
});
