import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { JournalsRepository } from "../repository";

import { InsertJournalLinkFlow } from "./flows/insert-journal-link.flow";

export class JournalLinkCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #journals = inject(JournalsRepository);
  readonly #flows = inject(Flows);
  readonly #logger = inject(LoggerFactoryToken).named("journal-link");

  constructor() {
    this.#commands.register({
      id: "insert-date-link",
      name: m.command_insert_date_link(),
      check: () => this.#workspace.hasActiveEditor() && !this.#journals.find().ids().next().done,
      execute: () => this.#run(),
    });
  }

  async #run(): Promise<void> {
    const result = await this.#flows.invoke(InsertJournalLinkFlow);
    if (result.isErr() && !(result.error instanceof UserAborted)) {
      this.#logger.error("insert-date-link failed", { error: result.error });
    }
  }
}
