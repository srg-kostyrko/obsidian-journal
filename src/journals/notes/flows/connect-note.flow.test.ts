import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";

import { NoteConnectionService } from "../note-connection";

import { ConnectNoteFlow } from "./connect-note.flow";

function build() {
  const c = new Container();
  c.addModule(LoggerModule);
  const connection = {
    connect: vi.fn(() => AsyncResult.ok({ path: "x.md" as VaultPath })),
    disconnect: vi.fn(() => AsyncResult.ok(undefined)),
  };
  const modals = new FakeModalService();
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(NoteConnectionService).useValue(connection as unknown as NoteConnectionService);
  c.register(Flows).useClass(Flows);
  c.register(ConnectNoteFlow).useClass(ConnectNoteFlow);
  return { flows: c.resolve(Flows), modals, connection };
}

describe("ConnectNoteFlow", () => {
  it("connects via the service when the modal returns a connect command", async () => {
    const { flows, modals, connection } = build();
    const promise = flows.invoke(ConnectNoteFlow, { path: "inbox/n.md" as VaultPath });
    modals
      .lastOpen()
      .submit({
        action: "connect",
        journalName: "daily",
        anchor: "2026-06-01",
        override: false,
        rename: false,
        move: false,
      });
    await promise;
    expect(connection.connect).toHaveBeenCalledWith("daily", "inbox/n.md", "2026-06-01", {
      override: false,
      rename: false,
      move: false,
    });
  });

  it("disconnects via the service when the modal returns a disconnect command", async () => {
    const { flows, modals, connection } = build();
    const promise = flows.invoke(ConnectNoteFlow, { path: "inbox/n.md" as VaultPath });
    modals.lastOpen().submit({ action: "disconnect" });
    await promise;
    expect(connection.disconnect).toHaveBeenCalledWith("inbox/n.md");
  });
});
