import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

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

import { DeleteDecorationFlow } from "./delete-decoration.flow";

function buildJournal(name: string, decorations: JournalConfig["decorations"]): JournalConfig {
  return { ...journalDefaultsFor({ type: "day" }, name), decorations };
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
  container.register(DeleteDecorationFlow).useClass(DeleteDecorationFlow);
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

describe("DeleteDecorationFlow", () => {
  it("reports an unknown owner when the journal is gone", async () => {
    const { flows } = build();
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
    const { flows } = build({ journals: { daily: buildJournal("daily", []) } });
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
    const { flows, modals } = build({ journals: { daily: buildJournal("daily", [sampleDecoration]) } });
    const promise = flows.invoke(DeleteDecorationFlow, { owner: { kind: "journal", journalName: "daily" }, index: 0 });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("removes the decoration when the user confirms", async () => {
    const { flows, modals, storage } = build({ journals: { daily: buildJournal("daily", [sampleDecoration]) } });
    const promise = flows.invoke(DeleteDecorationFlow, { owner: { kind: "journal", journalName: "daily" }, index: 0 });
    modals.lastOpen().submit({ confirmed: true });
    const result = await promise;
    expect(result.kind === "ok" && result.value.deleted).toEqual(sampleDecoration);
    expect(storage.daily?.decorations).toEqual([]);
  });

  it("removes a global decoration from the vault-wide list", async () => {
    const { flows, modals, store } = build();
    store.save({ kind: "global" }, [sampleCalendarDecoration]);
    const promise = flows.invoke(DeleteDecorationFlow, { owner: { kind: "global" }, index: 0 });
    modals.lastOpen().submit({ confirmed: true });
    await promise;

    expect(store.list({ kind: "global" })).toEqual([]);
  });
});
