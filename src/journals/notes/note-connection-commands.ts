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
      // v2 parity: registered with an editorCallback, so it appears only with an active
      // markdown editor — not in reading mode or on a non-markdown file (PDF/image).
      check: () => this.#workspace.hasActiveEditor(),
      execute: () => this.#run(),
    });
  }

  async #run(): Promise<void> {
    const path = this.#workspace.activeNote();
    if (path.isNone()) return;
    await this.#flows.invoke(ConnectNoteFlow, { path: path.value });
  }
}
