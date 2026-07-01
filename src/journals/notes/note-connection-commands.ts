import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { CommandService, WorkspaceService } from "@/infrastructure/host";

import { ConnectNoteFlow } from "./flows/connect-note.flow";

export class NoteConnectionCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #flows = inject(Flows);

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
    await this.#flows.invoke(ConnectNoteFlow, { path: path.value });
  }
}
