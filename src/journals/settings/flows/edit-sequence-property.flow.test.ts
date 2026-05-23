import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import {
  JournalLifecycleFlowError,
  JournalsRepository,
  UnknownJournalError,
  UnknownSequenceSourceError,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { EditSequencePropertyFlow } from "./edit-sequence-property.flow";

function makeConfigWithSource(name: string): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, name);
  return {
    ...base,
    numbering: {
      ...base.numbering,
      enabled: true,
      sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
    },
  };
}

function makeConfigWithoutSource(name: string): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, name);
  return { ...base, numbering: { ...base.numbering, enabled: true, sources: [] } };
}

async function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(Flows).useClass(Flows);
  container.register(EditSequencePropertyFlow).useClass(EditSequencePropertyFlow);
  return { storage, repo, modals, flows: container.resolve(Flows) };
}

describe("EditSequencePropertyFlow", () => {
  it("updates sources[sourceIndex].frontmatterKey on submit", async () => {
    const { flows, modals, repo } = await build({ daily: makeConfigWithSource("daily") });
    const promise = flows.invoke(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "sprint-no" });
    await promise;
    expect(repo.get("daily").getOr(undefined as never).numbering.sources[0]?.frontmatterKey).toBe("sprint-no");
  });

  it("returns the new value on submit", async () => {
    const { flows, modals } = await build({ daily: makeConfigWithSource("daily") });
    const promise = flows.invoke(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "issue-no" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ newValue: "issue-no" });
  });

  it("returns UserAborted('edit-sequence-property-modal') when cancelled", async () => {
    const { flows, modals } = await build({ daily: makeConfigWithSource("daily") });
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
    const { flows } = await build({ daily: makeConfigWithoutSource("daily") });
    const result = await flows.invoke(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownSequenceSourceError,
    );
  });
});
