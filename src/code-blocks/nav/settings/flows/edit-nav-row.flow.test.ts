import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import type { AnchorString } from "@/calendar";
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
  type NavBlockRow,
} from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { NavRowLifecycleFlowError, UnknownNavRowError } from "../errors";

import { EditNavBlockRowFlow } from "./edit-nav-row.flow";

function buildJournal(name: string, rows: NavBlockRow[]): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, name);
  return { ...base, navBlock: { ...base.navBlock, rows } };
}

function buildCustomJournal(name: string, rows: NavBlockRow[]): JournalConfig {
  const base = journalDefaultsFor(
    { type: "custom", every: "day", duration: 1, anchorDate: "2026-01-01" as AnchorString },
    name,
  );
  return { ...base, intervalBlock: { ...base.intervalBlock, rows } };
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
  container.register(EditNavBlockRowFlow).useClass(EditNavBlockRowFlow);
  return { storage, modals, flows: container.resolve(Flows) };
}

const sampleRow: NavBlockRow = {
  template: "{{date:YYYY}}",
  fontSize: 1,
  bold: false,
  italic: false,
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  link: "none",
  journal: "",
  addDecorations: false,
};

describe("EditNavBlockRowFlow", () => {
  it("returns UnknownJournalError when the journal does not exist", async () => {
    const { flows } = build();
    const result = await flows.invoke(EditNavBlockRowFlow, { journalName: "missing" });
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });

  it("returns UnknownNavRowError when rowIndex is out of range", async () => {
    const { flows } = build({ daily: buildJournal("daily", []) });
    const result = await flows.invoke(EditNavBlockRowFlow, { journalName: "daily", rowIndex: 5 });
    expect(result.kind === "err" && result.error).toBeInstanceOf(NavRowLifecycleFlowError);
    expect(result.kind === "err" && (result.error as NavRowLifecycleFlowError).cause).toBeInstanceOf(
      UnknownNavRowError,
    );
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = build({ daily: buildJournal("daily", []) });
    const promise = flows.invoke(EditNavBlockRowFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("appends and returns the new index when no rowIndex is provided", async () => {
    const { flows, modals, storage } = build({ daily: buildJournal("daily", [sampleRow]) });
    const promise = flows.invoke(EditNavBlockRowFlow, { journalName: "daily" });
    modals.lastOpen<{ journalName: string }, { row: NavBlockRow }>().submit({ row: sampleRow });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(1);
    expect(storage.daily?.navBlock.rows.length).toBe(2);
  });

  it("appends to intervalBlock rows when the field is intervalBlock", async () => {
    const { flows, modals, storage } = build({ custom: buildCustomJournal("custom", [sampleRow]) });
    const promise = flows.invoke(EditNavBlockRowFlow, { journalName: "custom", field: "intervalBlock" });
    modals.lastOpen<{ journalName: string }, { row: NavBlockRow }>().submit({ row: sampleRow });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(1);
    expect(storage.custom?.intervalBlock.rows.length).toBe(2);
  });

  it("replaces the row at rowIndex when a rowIndex is provided", async () => {
    const updated: NavBlockRow = { ...sampleRow, template: "x" };
    const { flows, modals, storage } = build({ daily: buildJournal("daily", [sampleRow]) });
    const promise = flows.invoke(EditNavBlockRowFlow, { journalName: "daily", rowIndex: 0 });
    modals.lastOpen<{ journalName: string }, { row: NavBlockRow }>().submit({ row: updated });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(0);
    expect(storage.daily?.navBlock.rows[0]).toEqual(updated);
  });
});
