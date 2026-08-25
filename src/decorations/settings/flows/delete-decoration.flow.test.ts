import { describe, expect, it } from "vitest";

import {
  DecorationLifecycleFlowError,
  UnknownDecorationError,
  UnknownDecorationOwnerError,
} from "@/decorations/errors";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import { JournalsRepository } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";
import type { ShelfConfig } from "@/shelves/config";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { DecorationsStore } from "../../decorations-store";
import { decorationsModule } from "../../module";
import { buildCalendarDecoration, buildDecoration } from "../../testing";
import { decorationsSettingsCoreModule } from "../module";

import { DeleteDecorationFlow } from "./delete-decoration.flow";

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

describe("DeleteDecorationFlow", () => {
  it("reports an unknown owner when the journal is gone", async () => {
    const { flows } = await build();
    const result = await flows.invoke(DeleteDecorationFlow, {
      owner: { kind: "journal", journalName: "missing" },
      index: 0,
    });
    expect(result.kind === "err" && result.error).toBeInstanceOf(DecorationLifecycleFlowError);
    expect(result.kind === "err" && (result.error as DecorationLifecycleFlowError).cause).toBeInstanceOf(
      UnknownDecorationOwnerError,
    );
  });

  it("returns UnknownDecorationError when the index is out of range", async () => {
    const { flows } = await build({ journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [] }) } });
    const result = await flows.invoke(DeleteDecorationFlow, {
      owner: { kind: "journal", journalName: "daily" },
      index: 0,
    });
    expect(result.kind === "err" && result.error).toBeInstanceOf(DecorationLifecycleFlowError);
    expect(result.kind === "err" && (result.error as DecorationLifecycleFlowError).cause).toBeInstanceOf(
      UnknownDecorationError,
    );
  });

  it("returns UserAborted when the user cancels", async () => {
    const { harness, flows } = await build({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [sampleDecoration] }) },
    });
    const promise = flows.invoke(DeleteDecorationFlow, { owner: { kind: "journal", journalName: "daily" }, index: 0 });
    harness.modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("removes the decoration when the user confirms", async () => {
    const { harness, flows, journals } = await build({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [sampleDecoration] }) },
    });
    const promise = flows.invoke(DeleteDecorationFlow, { owner: { kind: "journal", journalName: "daily" }, index: 0 });
    harness.modals.lastOpen().submit({ confirmed: true });
    const result = await promise;
    expect(result.kind === "ok" && result.value.deleted).toEqual(sampleDecoration);
    expect(journals.get("daily").getOrUndefined()?.decorations).toEqual([]);
  });

  it("removes a global decoration from the vault-wide list", async () => {
    const { harness, flows, store } = await build();
    store.save({ kind: "global" }, [sampleCalendarDecoration]);
    const promise = flows.invoke(DeleteDecorationFlow, { owner: { kind: "global" }, index: 0 });
    harness.modals.lastOpen().submit({ confirmed: true });
    await promise;

    expect(store.list({ kind: "global" })).toEqual([]);
  });
});
