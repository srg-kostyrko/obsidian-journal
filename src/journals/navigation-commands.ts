import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { CommandService, NoticeService, WorkspaceService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { JournalsIndex } from "./journals-index";

type Direction = "next" | "previous";

export class JournalNavigationCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #notices = inject(NoticeService);
  readonly #index = inject(JournalsIndex);
  readonly #logger = inject(LoggerFactoryToken).named("journal-navigation");

  constructor() {
    this.#commands.register({
      id: "open-next",
      name: m.command_open_next(),
      check: () => this.#workspace.activeNote().isSome(),
      execute: () => this.#open("next"),
    });
    this.#commands.register({
      id: "open-prev",
      name: m.command_open_previous(),
      check: () => this.#workspace.activeNote().isSome(),
      execute: () => this.#open("previous"),
    });
  }

  #open(direction: Direction): void {
    const active = this.#workspace.activeNote();
    if (!active.isSome()) return;
    const entry = this.#index.entryByPath(active.value);
    if (!entry.isSome()) {
      this.#notices.show(m.command_open_not_connected());
      return;
    }
    const target =
      direction === "next"
        ? this.#index.findNext(entry.value.journalName, entry.value.anchor)
        : this.#index.findPrevious(entry.value.journalName, entry.value.anchor);
    if (!target.isSome()) {
      this.#notices.show(direction === "next" ? m.command_open_no_next() : m.command_open_no_previous());
      return;
    }
    this.#workspace.openNote(target.value).tapErr((error) => {
      this.#logger.error("failed to open journal note", { path: target.value, error });
    });
  }
}
