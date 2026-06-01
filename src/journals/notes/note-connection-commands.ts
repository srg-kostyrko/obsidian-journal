import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { ConnectNoteFlow } from "./flows/connect-note.flow";

export class NoteConnectionCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #flows = inject(Flows);
  readonly #logger = inject(LoggerFactoryToken).named("note-connection");

  constructor() {
    this.#commands.register({
      id: "connect-note",
      name: m.command_connect_note(),
      check: () => this.#workspace.activeNote().isSome(),
      execute: () => this.#run(),
    });
  }

  async #run(): Promise<void> {
    const path = this.#workspace.activeNote();
    if (path.isNone()) return;
    const result = await this.#flows.invoke(ConnectNoteFlow, { path: path.value });
    if (result.kind === "err" && !(result.error instanceof UserAborted)) {
      this.#logger.error("connect-note failed", { error: result.error });
    }
  }
}
