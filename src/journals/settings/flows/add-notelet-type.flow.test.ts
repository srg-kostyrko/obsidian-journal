import { beforeEach, describe, expect, it } from "vitest";

import { commandsCoreModule } from "@/commands/module";
import { CommandsRepository } from "@/commands/repository";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { JournalsRepository } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";
import { JournalsEventsToken } from "@/journals/tokens";
import { SettingsUiService } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";
import { journalsSettingsUiModule } from "../ui-module";

import { AddNoteletTypeFlow } from "./add-notelet-type.flow";

describe("AddNoteletTypeFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule, commandsCoreModule],
      data: { journals: { Work: fixedJournal("Work", { type: "day" }) }, commands: {} },
    });
  });

  function submitName(name: string): void {
    harness.modals.lastOpen<{ journalName: string }, { name: string }>().submit({ name });
  }

  async function addStandup(): Promise<string> {
    const promise = harness.resolve(Flows).invoke(AddNoteletTypeFlow, { journalName: "Work" });
    submitName("Standup");
    const result = await promise;
    if (result.kind !== "ok") throw new Error("expected the flow to succeed");
    return result.value.typeId;
  }

  it("creates the type under a fresh id", async () => {
    const typeId = await addStandup();

    const config = harness.resolve(JournalsRepository).get("Work").getOrUndefined();
    expect(config?.notelets[typeId]).toMatchObject({ name: "Standup" });
  });

  it("stores the id in the entry's own id field", async () => {
    const typeId = await addStandup();

    const config = harness.resolve(JournalsRepository).get("Work").getOrUndefined();
    expect(config?.notelets[typeId]?.id).toBe(typeId);
  });

  it("announces the new type instead of writing a command itself", async () => {
    const seen: string[] = [];
    harness.resolve(JournalsEventsToken).on("noteletTypeAdded", (_journalName, type) => seen.push(type.name));

    await addStandup();

    expect(seen).toEqual(["Standup"]);
    expect([...harness.resolve(CommandsRepository).find().entries()]).toEqual([]);
  });

  it("navigates to the new type's page", async () => {
    const typeId = await addStandup();

    const ui = harness.resolve(SettingsUiService);
    expect(ui.current.value?.subpage.key).toBe("notelet-type-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "Work", typeId });
  });

  it("creates nothing when the modal is cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(AddNoteletTypeFlow, { journalName: "Work" });
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(harness.resolve(JournalsRepository).get("Work").getOrUndefined()?.notelets).toEqual({});
    expect(harness.resolve(CommandsRepository).count()).toBe(0);
  });

  it("creates nothing when the journal is deleted while the modal is open", async () => {
    const promise = harness.resolve(Flows).invoke(AddNoteletTypeFlow, { journalName: "Work" });
    harness.resolve(JournalsRepository).delete("Work");
    submitName("Standup");
    const result = await promise;

    expect(result.kind).toBe("err");
    expect(harness.resolve(JournalsRepository).get("Work").isNone()).toBe(true);
    expect(harness.resolve(CommandsRepository).count()).toBe(0);
  });

  it("refuses a journal that does not exist", async () => {
    const result = await harness.resolve(Flows).invoke(AddNoteletTypeFlow, { journalName: "Missing" });

    expect(result.kind).toBe("err");
    expect(harness.modals.opens).toHaveLength(0);
  });
});
