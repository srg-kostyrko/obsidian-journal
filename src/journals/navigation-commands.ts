import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { Option } from "@/infrastructure/result";

import { JournalsIndex } from "./journals-index";

type Direction = "next" | "previous";

export class JournalNavigationCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #index = inject(JournalsIndex);
  readonly #logger = inject(LoggerFactoryToken).named("journal-navigation");

  constructor() {
    this.#commands.register({
      id: "open-next",
      name: m.command_open_next(),
      check: () => this.#resolve("next").isSome(),
      execute: () => this.#open("next"),
    });
    this.#commands.register({
      id: "open-prev",
      name: m.command_open_previous(),
      check: () => this.#resolve("previous").isSome(),
      execute: () => this.#open("previous"),
    });
  }

  #resolve(direction: Direction): Option<VaultPath> {
    return this.#workspace
      .activeNote()
      .flatMap((path) =>
        this.#index
          .entryByPath(path)
          .flatMap((entry) =>
            direction === "next"
              ? this.#index.findNext(entry.journalName, entry.anchor)
              : this.#index.findPrevious(entry.journalName, entry.anchor),
          ),
      );
  }

  #open(direction: Direction): void {
    const target = this.#resolve(direction);
    if (!target.isSome()) return;
    this.#workspace.openNote(target.value).tapErr((error) => {
      this.#logger.error("failed to open journal note", { path: target.value, error });
    });
  }
}
