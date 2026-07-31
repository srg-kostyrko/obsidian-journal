import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import type { AnchorString } from "@/calendar";
import type { JournalDecoration } from "@/decorations";
import {
  DecorationLifecycleFlowError,
  UnknownDecorationError,
  UnknownDecorationOwnerError,
} from "@/decorations/errors";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { JournalsRepository, journalDefaultsFor, type JournalConfig, type JournalsEvents } from "@/journals";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { DecorationsStore } from "../../decorations-store";
import { decorationsSlice } from "../../settings/slice";
import { buildCalendarDecoration, buildDecoration } from "../../testing";
import { CALENDAR_CONDITION_TYPES, conditionTypeOptions } from "../ui/condition-types";

import { EditDecorationFlow } from "./edit-decoration.flow";

import type { EditDecorationModalProps } from "../ui/modals";

function buildJournal(name: string, decorations: JournalDecoration[]): JournalConfig {
  return { ...journalDefaultsFor({ type: "day" }, name), decorations };
}

function buildCustomJournal(name: string): JournalConfig {
  return journalDefaultsFor(
    { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString },
    name,
  );
}

function build(options: { journals?: Record<string, JournalConfig>; shelves?: Record<string, ShelfConfig> } = {}) {
  const { container } = createSettingsService({ slices: [decorationsSlice] });
  const storage = reactive<Record<string, JournalConfig>>({ ...options.journals });
  const shelfStorage = reactive<Record<string, ShelfConfig>>({ ...options.shelves });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const shelves = ShelvesRepository.fromParts(shelfStorage, createNanoEvents<ShelvesEvents>());
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(ShelvesRepository).useValue(shelves);
  container.register(DecorationsStore).useClass(DecorationsStore);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  container.register(EditDecorationFlow).useClass(EditDecorationFlow);
  return { storage, modals, flows: container.resolve(Flows), store: container.resolve(DecorationsStore) };
}

const sampleDecoration = buildDecoration({
  conditions: [{ type: "has-note" }],
  styles: [{ type: "background", color: { type: "transparent" } }],
});

const sampleCalendarDecoration = buildCalendarDecoration({
  conditions: [{ type: "weekday", weekdays: [6] }],
  styles: [{ type: "background", color: { type: "transparent" } }],
});

describe("EditDecorationFlow", () => {
  it("reports an unknown owner when the journal does not exist", async () => {
    const { flows } = build();
    const result = await flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "missing" } });
    expect(result.kind === "err" && result.error).toBeInstanceOf(DecorationLifecycleFlowError);
    expect(result.kind === "err" && (result.error as DecorationLifecycleFlowError).cause).toBeInstanceOf(
      UnknownDecorationOwnerError,
    );
  });

  it("returns UnknownDecorationError for an out-of-range edit index", async () => {
    const { flows } = build({ journals: { daily: buildJournal("daily", []) } });
    const result = await flows.invoke(EditDecorationFlow, {
      owner: { kind: "journal", journalName: "daily" },
      index: 5,
    });
    expect(result.kind === "err" && result.error).toBeInstanceOf(DecorationLifecycleFlowError);
    expect(result.kind === "err" && (result.error as DecorationLifecycleFlowError).cause).toBeInstanceOf(
      UnknownDecorationError,
    );
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = build({ journals: { daily: buildJournal("daily", []) } });
    const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "daily" } });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("appends and returns the new index when no index is provided", async () => {
    const { flows, modals, storage } = build({ journals: { daily: buildJournal("daily", [sampleDecoration]) } });
    const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "daily" } });
    modals.lastOpen<unknown, { decoration: JournalDecoration }>().submit({ decoration: sampleDecoration });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(1);
    expect(storage.daily?.decorations.length).toBe(2);
  });

  it("replaces the decoration at index when an index is provided", async () => {
    const updated: JournalDecoration = { ...sampleDecoration, mode: "or" };
    const { flows, modals, storage } = build({ journals: { daily: buildJournal("daily", [sampleDecoration]) } });
    const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "daily" }, index: 0 });
    modals.lastOpen<unknown, { decoration: JournalDecoration }>().submit({ decoration: updated });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(0);
    expect(storage.daily?.decorations[0]).toEqual(updated);
  });

  it("appends a new decoration to a shelf's list", async () => {
    const { flows, modals, store } = build({
      shelves: { work: { name: "work", journals: [], decorations: [] } },
    });
    const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "shelf", shelfName: "work" } });
    modals.lastOpen<unknown, { decoration: JournalDecoration }>().submit({ decoration: sampleCalendarDecoration });
    const result = await promise;

    expect(result.kind === "ok" && result.value.index).toBe(0);
    expect(store.list({ kind: "shelf", shelfName: "work" })).toEqual([sampleCalendarDecoration]);
  });

  describe("condition types offered to the modal", () => {
    it("offers a custom journal's write-type condition set", async () => {
      const { flows, modals } = build({ journals: { daily: buildCustomJournal("daily") } });
      const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "daily" } });
      const opened = modals.lastOpen<EditDecorationModalProps, { decoration: JournalDecoration }>();
      opened.submit({ decoration: sampleDecoration });
      await promise;

      expect(opened.props.conditionTypes).toEqual(conditionTypeOptions.custom);
    });

    it("offers only calendar condition types for a shelf owner", async () => {
      const { flows, modals } = build({
        shelves: { work: { name: "work", journals: [], decorations: [] } },
      });
      const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "shelf", shelfName: "work" } });
      const opened = modals.lastOpen<EditDecorationModalProps, { decoration: JournalDecoration }>();
      opened.submit({ decoration: sampleCalendarDecoration });
      await promise;

      expect(opened.props.conditionTypes).toEqual(CALENDAR_CONDITION_TYPES);
    });
  });
});
