import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Flows, UserAborted } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import type { NoteletType, TypeId } from "@/journals/notelets/config";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { JournalsRepository } from "@/journals/repository";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { journalsSettingsCoreModule } from "../module";
import { journalsSettingsUiModule } from "../ui-module";

import { EditNoteletCounterKeyFlow } from "./edit-notelet-counter-key.flow";

describe("EditNoteletCounterKeyFlow", () => {
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

  function invoke(typeId = "nt_7f3a") {
    return harness.resolve(Flows).invoke(EditNoteletCounterKeyFlow, { journalName: "Work", typeId });
  }

  it("writes the submitted key onto the type's counter", async () => {
    const promise = invoke();
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "standup-number" });
    await promise;

    expect(typeOf("nt_7f3a")?.counter.frontmatterKey).toBe("standup-number");
  });

  it("leaves the counter's enabled state and the type's other settings alone", async () => {
    const promise = invoke();
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "standup-number" });
    await promise;

    expect(typeOf("nt_7f3a")).toMatchObject({ name: "Standup", folder: "Meetings", counter: { enabled: true } });
  });

  it("leaves the journal's other types alone", async () => {
    const promise = invoke();
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "standup-number" });
    await promise;

    expect(typeOf("nt_91cc")?.counter.frontmatterKey).toBe("journal-notelet-index");
  });

  it("writes nothing when the modal is cancelled", async () => {
    const promise = invoke();
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(typeOf("nt_7f3a")?.counter.frontmatterKey).toBe("journal-notelet-index");
  });

  it("refuses a type the journal does not have", async () => {
    const result = await invoke("nt_missing");

    expect(result.kind).toBe("err");
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("writes nothing when the type is deleted while the modal is open", async () => {
    const promise = invoke();
    harness.resolve(JournalsRepository).update("Work", { notelets: {} });
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "standup-number" });
    const result = await promise;

    expect(result.kind).toBe("err");
    expect(typeOf("nt_7f3a")).toBeUndefined();
  });

  it("moves the stored counter to the new key on that type's notelets", async () => {
    const noteletPath = "Standup 1.md" as VaultPath;
    harness.host.putFile(noteletPath, "content", {
      journal: "Work",
      "journal-date": "2026-06-01",
      "journal-notelet": "Standup",
      "journal-notelet-index": 1,
    });
    harness.resolve(JournalsIndex).register({
      kind: "notelet",
      journalName: "Work",
      anchor: anchor("2026-06-01"),
      path: noteletPath,
      typeName: "Standup",
      typeId: "nt_7f3a" as TypeId,
      counter: 1,
    });
    const promise = invoke();
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "standup-number" });
    await promise;

    expect(harness.host.files.get(noteletPath)?.frontmatter).toMatchObject({ "standup-number": 1 });
    expect(harness.host.files.get(noteletPath)?.frontmatter["journal-notelet-index"]).toBeUndefined();
  });

  it("leaves another type's notelets alone when one type's counter key is renamed", async () => {
    const retroPath = "Retro 1.md" as VaultPath;
    harness.host.putFile(retroPath, "content", {
      journal: "Work",
      "journal-date": "2026-06-01",
      "journal-notelet": "Retro",
      "journal-notelet-index": 1,
    });
    harness.resolve(JournalsIndex).register({
      kind: "notelet",
      journalName: "Work",
      anchor: anchor("2026-06-01"),
      path: retroPath,
      typeName: "Retro",
      typeId: "nt_91cc" as TypeId,
      counter: 1,
    });
    const promise = invoke();
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "standup-number" });
    await promise;

    expect(harness.host.files.get(retroPath)?.frontmatter).toMatchObject({ "journal-notelet-index": 1 });
  });

  it("does not cascade a rename when the key is unchanged", async () => {
    const connection = harness.resolve(NoteConnectionService);
    const spy = vi.spyOn(connection, "renameNoteletFieldForType");
    const promise = invoke();
    harness.modals.lastOpen<unknown, { newValue: string }>().submit({ newValue: "journal-notelet-index" });
    await promise;

    expect(spy).not.toHaveBeenCalled();
  });
});
