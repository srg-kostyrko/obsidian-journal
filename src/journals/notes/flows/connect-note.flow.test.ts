import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { NoteNotFoundError } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../../journals-index";
import { journalsCoreModule } from "../../module";
import { buildNoteletType, fixedJournal } from "../../testing";
import { NoteConnectionService } from "../note-connection";

import { ConnectNoteFlow } from "./connect-note.flow";

import type { TypeId } from "../../notelets/config";

const SOURCE = "inbox/n.md" as VaultPath;

const CONNECT_COMMAND = {
  action: "connect",
  journalName: "daily",
  anchor: "2026-06-01",
  override: false,
  rename: false,
  move: false,
};

describe("ConnectNoteFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
  });

  function seedConnected(): void {
    harness.host.putFile(SOURCE, "content", { journal: "daily", "journal-date": "2026-06-01" });
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path: SOURCE });
  }

  it("connects via the service when the modal returns a connect command", async () => {
    harness.host.putFile(SOURCE, "");
    const promise = harness.resolve(Flows).invoke(ConnectNoteFlow, { path: SOURCE });

    harness.modals.lastOpen().submit(CONNECT_COMMAND);
    await promise;

    expect(harness.host.files.get(SOURCE)?.frontmatter).toEqual({
      journal: "daily",
      "journal-date": "2026-06-01",
    });
  });

  it("disconnects via the service when the modal returns a disconnect command", async () => {
    seedConnected();
    const promise = harness.resolve(Flows).invoke(ConnectNoteFlow, { path: SOURCE });

    harness.modals.lastOpen().submit({ action: "disconnect", journalName: "daily" });
    await promise;

    expect(harness.host.files.get(SOURCE)?.frontmatter).toEqual({});
  });

  it("announces a successful connection", async () => {
    harness.host.putFile(SOURCE, "");
    const promise = harness.resolve(Flows).invoke(ConnectNoteFlow, { path: SOURCE });

    harness.modals.lastOpen().submit(CONNECT_COMMAND);
    await promise;

    expect(harness.notices.messages).toContain(m.connect_note_notice_connected({ journalName: "daily" }));
  });

  it("announces a successful disconnection", async () => {
    seedConnected();
    const promise = harness.resolve(Flows).invoke(ConnectNoteFlow, { path: SOURCE });

    harness.modals.lastOpen().submit({ action: "disconnect", journalName: "daily" });
    await promise;

    expect(harness.notices.messages).toContain(m.connect_note_notice_disconnected({ journalName: "daily" }));
  });

  it("does not report success when the connection fails", async () => {
    harness.host.putFile(SOURCE, "");
    vi.spyOn(harness.resolve(NoteConnectionService), "connect").mockReturnValue(
      AsyncResult.err(new NoteNotFoundError(SOURCE)),
    );
    const promise = harness.resolve(Flows).invoke(ConnectNoteFlow, { path: SOURCE });

    harness.modals.lastOpen().submit(CONNECT_COMMAND);
    await promise;

    expect(harness.notices.messages).not.toContain(m.connect_note_notice_connected({ journalName: "daily" }));
  });

  it("connects as a notelet when the modal names a type", async () => {
    const withType = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } },
          ),
        },
      },
    });
    withType.host.putFile(SOURCE, "");
    const promise = withType.resolve(Flows).invoke(ConnectNoteFlow, { path: SOURCE });

    withType.modals.lastOpen().submit({ ...CONNECT_COMMAND, typeId: "nt_1" });
    await promise;

    expect(withType.host.files.get(SOURCE)?.frontmatter).toMatchObject({ "journal-notelet": "Standup" });
  });

  it("names the type in the notice when it connected a notelet", async () => {
    const withType = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } },
          ),
        },
      },
    });
    withType.host.putFile(SOURCE, "");
    const promise = withType.resolve(Flows).invoke(ConnectNoteFlow, { path: SOURCE });

    withType.modals.lastOpen().submit({ ...CONNECT_COMMAND, typeId: "nt_1" });
    await promise;

    expect(withType.notices.messages).toContain(
      m.connect_note_notice_connected_notelet({ journalName: "daily", type: "Standup" }),
    );
  });
});
