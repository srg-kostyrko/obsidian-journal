import { beforeEach, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
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

  it("writes nothing when the type is deleted while the modal is open", async () => {
    const promise = harness.resolve(Flows).invoke(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_7f3a" });
    harness.resolve(JournalsRepository).update("Work", { notelets: {} });
    harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "Daily sync" });
    const result = await promise;

    expect(result.kind).toBe("err");
    expect(harness.resolve(JournalsRepository).get("Work").getOrUndefined()?.notelets).toEqual({});
  });

  it("refuses a type the journal does not have", async () => {
    const result = await harness
      .resolve(Flows)
      .invoke(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_missing" });

    expect(result.kind).toBe("err");
    expect(harness.modals.opens).toHaveLength(0);
  });

  describe("cascading notelets", () => {
    const standupPath = "Standup 1.md" as VaultPath;
    const retroPath = "Retro 1.md" as VaultPath;

    beforeEach(() => {
      const index = harness.resolve(JournalsIndex);
      for (const [path, typeName, typeId] of [
        [standupPath, "Standup", "nt_7f3a"],
        [retroPath, "Retro", "nt_91cc"],
      ] as const) {
        harness.host.putFile(path, "content", {
          journal: "Work",
          "journal-date": "2026-06-01",
          "journal-notelet": typeName,
        });
        index.register({
          kind: "notelet",
          journalName: "Work",
          anchor: anchor("2026-06-01"),
          path,
          typeName,
          typeId: typeId as TypeId,
        });
      }
    });

    it("rewrites the stored type name on every notelet of the renamed type", async () => {
      const promise = harness.resolve(Flows).invoke(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_7f3a" });
      harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "Daily sync" });
      await promise;

      expect(harness.host.files.get(standupPath)?.frontmatter).toMatchObject({ "journal-notelet": "Daily sync" });
    });

    it("leaves a different type's notelets under their own stored name", async () => {
      const promise = harness.resolve(Flows).invoke(RenameNoteletTypeFlow, { journalName: "Work", typeId: "nt_7f3a" });
      harness.modals.lastOpen<{ currentName: string }, { newName: string }>().submit({ newName: "Daily sync" });
      await promise;

      expect(harness.host.files.get(retroPath)?.frontmatter).toMatchObject({ "journal-notelet": "Retro" });
    });
  });
});
