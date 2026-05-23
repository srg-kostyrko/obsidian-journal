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
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { EditFrontmatterFieldFlow } from "./edit-frontmatter-field.flow";

async function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(Flows).useClass(Flows);
  container.register(EditFrontmatterFieldFlow).useClass(EditFrontmatterFieldFlow);
  return { storage, repo, modals, flows: container.resolve(Flows) };
}

describe("EditFrontmatterFieldFlow", () => {
  it("updates dateField on submit", async () => {
    const { flows, modals, repo } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "happened-on" });
    await promise;
    expect(repo.get("daily").getOr(undefined as never).frontmatter.dateField).toBe("happened-on");
  });

  it("updates startDateField on submit", async () => {
    const { flows, modals, repo } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "startDateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "begins-on" });
    await promise;
    expect(repo.get("daily").getOr(undefined as never).frontmatter.startDateField).toBe("begins-on");
  });

  it("updates endDateField on submit", async () => {
    const { flows, modals, repo } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "endDateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "ends-on" });
    await promise;
    expect(repo.get("daily").getOr(undefined as never).frontmatter.endDateField).toBe("ends-on");
  });

  it("returns the new value on submit", async () => {
    const { flows, modals } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
    const promise = flows.invoke(EditFrontmatterFieldFlow, { journalName: "daily", fieldName: "dateField" });
    modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "x" });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ newValue: "x" });
  });

  it("returns UserAborted('edit-frontmatter-field-modal') when cancelled", async () => {
    const { flows, modals } = await build({ daily: journalDefaultsFor({ type: "day" }, "daily") });
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
