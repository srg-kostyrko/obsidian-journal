import { describe, expect, it } from "vitest";

import type { JournalDecoration } from "@/decorations";
import {
  DecorationLifecycleFlowError,
  UnknownDecorationError,
  UnknownDecorationOwnerError,
} from "@/decorations/errors";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import { JournalsRepository } from "@/journals/repository";
import { customJournal, fixedJournal } from "@/journals/testing";
import type { ShelfConfig } from "@/shelves/config";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { DecorationsStore } from "../../decorations-store";
import { decorationsModule } from "../../module";
import { buildCalendarDecoration, buildDecoration } from "../../testing";
import { decorationsSettingsCoreModule } from "../module";
import { CALENDAR_CONDITION_TYPES, conditionTypeOptions } from "../ui/condition-types";

import { EditDecorationFlow } from "./edit-decoration.flow";

import type { EditDecorationModalProps } from "../ui/modals";

async function build(
  options: { journals?: Record<string, JournalConfig>; shelves?: Record<string, ShelfConfig> } = {},
) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule],
    data: {
      journals: options.journals ?? {},
      shelves: options.shelves ?? {},
    },
  });
  return {
    harness,
    flows: harness.resolve(Flows),
    store: harness.resolve(DecorationsStore),
    journals: harness.resolve(JournalsRepository),
  };
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
    const { flows } = await build();
    const result = await flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "missing" } });
    expect(result.kind === "err" && result.error).toBeInstanceOf(DecorationLifecycleFlowError);
    expect(result.kind === "err" && (result.error as DecorationLifecycleFlowError).cause).toBeInstanceOf(
      UnknownDecorationOwnerError,
    );
  });

  it("returns UnknownDecorationError for an out-of-range edit index", async () => {
    const { flows } = await build({ journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [] }) } });
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
    const { harness, flows } = await build({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [] }) },
    });
    const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "daily" } });
    harness.modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("appends and returns the new index when no index is provided", async () => {
    const { harness, flows, journals } = await build({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [sampleDecoration] }) },
    });
    const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "daily" } });
    harness.modals.lastOpen<unknown, { decoration: JournalDecoration }>().submit({ decoration: sampleDecoration });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(1);
    expect(journals.get("daily").getOrUndefined()?.decorations.length).toBe(2);
  });

  it("replaces the decoration at index when an index is provided", async () => {
    const updated: JournalDecoration = { ...sampleDecoration, mode: "or" };
    const { harness, flows, journals } = await build({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [sampleDecoration] }) },
    });
    const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "daily" }, index: 0 });
    harness.modals.lastOpen<unknown, { decoration: JournalDecoration }>().submit({ decoration: updated });
    const result = await promise;
    expect(result.kind === "ok" && result.value.index).toBe(0);
    expect(journals.get("daily").getOrUndefined()?.decorations[0]).toEqual(updated);
  });

  it("appends a new decoration to a shelf's list", async () => {
    const { harness, flows, store } = await build({
      shelves: { work: buildShelf("work") },
    });
    const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "shelf", shelfName: "work" } });
    harness.modals
      .lastOpen<unknown, { decoration: JournalDecoration }>()
      .submit({ decoration: sampleCalendarDecoration });
    const result = await promise;

    expect(result.kind === "ok" && result.value.index).toBe(0);
    expect(store.list({ kind: "shelf", shelfName: "work" })).toEqual([sampleCalendarDecoration]);
  });

  describe("condition types offered to the modal", () => {
    it("offers a custom journal's write-type condition set", async () => {
      const { harness, flows } = await build({
        journals: { daily: customJournal("daily", "week", 2, "2024-01-01") },
      });
      const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "daily" } });
      const opened = harness.modals.lastOpen<EditDecorationModalProps, { decoration: JournalDecoration }>();
      opened.submit({ decoration: sampleDecoration });
      await promise;

      expect(opened.props.conditionTypes).toEqual(conditionTypeOptions.custom);
    });

    it("offers only calendar condition types for a shelf owner", async () => {
      const { harness, flows } = await build({
        shelves: { work: buildShelf("work") },
      });
      const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "shelf", shelfName: "work" } });
      const opened = harness.modals.lastOpen<EditDecorationModalProps, { decoration: JournalDecoration }>();
      opened.submit({ decoration: sampleCalendarDecoration });
      await promise;

      expect(opened.props.conditionTypes).toEqual(CALENDAR_CONDITION_TYPES);
    });
  });

  describe("journalName passed to the modal", () => {
    it("passes the owning journal's name for a journal owner", async () => {
      const { harness, flows } = await build({
        journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [] }) },
      });
      const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "journal", journalName: "daily" } });
      const opened = harness.modals.lastOpen<EditDecorationModalProps, { decoration: JournalDecoration }>();
      opened.submit({ decoration: sampleDecoration });
      await promise;

      expect(opened.props.journalName).toBe("daily");
    });

    it("passes no journal name for a shelf owner", async () => {
      const { harness, flows } = await build({
        shelves: { work: buildShelf("work") },
      });
      const promise = flows.invoke(EditDecorationFlow, { owner: { kind: "shelf", shelfName: "work" } });
      const opened = harness.modals.lastOpen<EditDecorationModalProps, { decoration: JournalDecoration }>();
      opened.submit({ decoration: sampleCalendarDecoration });
      await promise;

      expect(opened.props.journalName).toBeUndefined();
    });
  });
});
