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
import { fixedJournal } from "../../testing";
import { NoteConnectionService } from "../note-connection";

import { ConnectNoteFlow } from "./connect-note.flow";

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
});
