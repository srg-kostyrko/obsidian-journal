import { beforeEach, describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import type { NoteletType, TypeId } from "@/journals/notelets/config";
import { JournalsRepository } from "@/journals/repository";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";
import { journalsSettingsUiModule } from "../ui-module";

import { RenameNoteletTypeFlow } from "./rename-notelet-type.flow";

describe("RenameNoteletTypeFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, journalsSettingsCoreModule, journalsSettingsUiModule],
      data: {
        journals: {
          Work: fixedJournal(
            "Work",
            { type: "day" },
            {
              notelets: {
                nt_7f3a: buildNoteletType({ id: "nt_7f3a" as TypeId, name: "Standup", folder: "Meetings" }),
                nt_91cc: buildNoteletType({ id: "nt_91cc" as TypeId, name: "Retro" }),
              },
            },
          ),
        },
      },
    });
  });

  function typeOf(typeId: string): NoteletType | undefined {
    return harness.resolve(JournalsRepository).get("Work").getOrUndefined()?.notelets[typeId];
  }

  it("writes the new name onto the type, keeping its id", async () => {
    const promise = harness.resolve(Flows).invoke(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_7f3a" });
    harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "Daily sync" });
    await promise;

    expect(typeOf("nt_7f3a")).toMatchObject({ id: "nt_7f3a", name: "Daily sync" });
  });

  it("leaves the type's other settings untouched", async () => {
    const promise = harness.resolve(Flows).invoke(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_7f3a" });
    harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "Daily sync" });
    await promise;

    expect(typeOf("nt_7f3a")?.folder).toBe("Meetings");
  });

  it("leaves the journal's other types alone", async () => {
    const promise = harness.resolve(Flows).invoke(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_7f3a" });
    harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "Daily sync" });
    await promise;

    expect(typeOf("nt_91cc")?.name).toBe("Retro");
  });

  it("opens the modal on the type's current name", async () => {
    const promise = harness.resolve(Flows).invoke(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_7f3a" });
    const opened = harness.modals.lastOpen<{ currentName: string }, { newName: string }>();

    expect(opened.props.currentName).toBe("Standup");

    opened.cancel();
    await promise;
  });

  it("renames nothing when the modal is cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_7f3a" });
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(typeOf("nt_7f3a")?.name).toBe("Standup");
  });

  it("refuses a type the journal does not have", async () => {
    const result = await harness
      .resolve(Flows)
      .invoke(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_missing" });

    expect(result.kind).toBe("err");
    expect(harness.modals.opens).toHaveLength(0);
  });
});
