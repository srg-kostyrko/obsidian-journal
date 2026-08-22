import { beforeEach, describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { JournalLifecycleFlowError, JournalNameTakenError } from "@/journals/errors";
import { journalsCoreModule } from "@/journals/module";
import { JournalsRepository } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";
import { SettingsUiService } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";
import { journalsSettingsUiModule } from "../ui-module";

import { AddJournalFlow } from "./add-journal.flow";

describe("AddJournalFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule],
    });
  });

  it("creates the journal in storage on submit", async () => {
    const promise = harness.resolve(Flows).invoke(AddJournalFlow, undefined);
    harness.modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({
      name: "daily",
      write: { type: "day" },
    });
    await promise;
    expect(harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.name).toBe("daily");
  });

  it("pushes the journal-edit subpage on submit", async () => {
    const promise = harness.resolve(Flows).invoke(AddJournalFlow, undefined);
    harness.modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({
      name: "daily",
      write: { type: "day" },
    });
    await promise;
    const ui = harness.resolve(SettingsUiService);
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily" });
  });

  it("returns the created name on submit", async () => {
    const promise = harness.resolve(Flows).invoke(AddJournalFlow, undefined);
    harness.modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({
      name: "daily",
      write: { type: "day" },
    });
    const result = await promise;
    expect(result.kind === "ok" && result.value).toEqual({ name: "daily" });
  });

  it("returns UserAborted('add-journal-modal') when the modal is cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(AddJournalFlow, undefined);
    harness.modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("add-journal-modal");
  });

  it("maps a name-taken error to JournalLifecycleFlowError", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const promise = harness.resolve(Flows).invoke(AddJournalFlow, undefined);
    harness.modals.lastOpen<void, { name: string; write: { type: "day" } }>().submit({
      name: "daily",
      write: { type: "day" },
    });
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      JournalNameTakenError,
    );
  });
});
