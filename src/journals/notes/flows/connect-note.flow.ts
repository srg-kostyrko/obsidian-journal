import { match } from "ts-pattern";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { UserAborted, type Flow } from "@/infrastructure/flows";
import { NoticeService, type VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { NoteConnectionService, type ConnectError, type DisconnectError } from "../note-connection";
import { connectNoteModal } from "../ui/modals";

export class ConnectNoteFlow implements Flow<{ path: VaultPath }, void, ConnectError | DisconnectError | UserAborted> {
  readonly #modals = inject(ModalService);
  readonly #connection = inject(NoteConnectionService);
  readonly #notices = inject(NoticeService);

  execute(parameters: { path: VaultPath }): AsyncResult<void, ConnectError | DisconnectError | UserAborted> {
    return attempt.in(this, async function* (this: ConnectNoteFlow) {
      const command = yield* this.#modals
        .open(connectNoteModal, { path: parameters.path })
        .mapErr(() => new UserAborted("connect-note-modal"));

      yield* match(command)
        .with({ action: "connect" }, (c) =>
          this.#connection
            .connect(c.journalName, parameters.path, c.anchor, {
              override: c.override,
              rename: c.rename,
              move: c.move,
            })
            .tap(() => this.#notices.show(m.connect_note_notice_connected({ journalName: c.journalName }))),
        )
        .with({ action: "disconnect" }, (c) =>
          this.#connection
            .disconnect(parameters.path)
            .tap(() => this.#notices.show(m.connect_note_notice_disconnected({ journalName: c.journalName }))),
        )
        .exhaustive();
      return;
    });
  }
}
