import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { CommandService, WorkspaceService } from "@/infrastructure/host";

import { JournalsRepository } from "../repository";

import { InsertJournalLinkFlow } from "./flows/insert-journal-link.flow";

export class JournalLinkCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #journals = inject(JournalsRepository);
  readonly #flows = inject(Flows);

  constructor() {
    this.#commands.register({
      id: "insert-date-link",
      name: m.command_insert_date_link(),
      check: () => this.#workspace.hasActiveEditor() && !this.#journals.find().ids().next().done,
      execute: () => this.#run(),
    });
  }

  async #run(): Promise<void> {
    await this.#flows.invoke(InsertJournalLinkFlow);
  }
}
