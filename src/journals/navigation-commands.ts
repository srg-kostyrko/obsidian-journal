import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { CommandService, NoticeService, WorkspaceService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { Option } from "@/infrastructure/result";

import { JournalsIndex } from "./journals-index";

import type { JournalEntry } from "./types";

type Direction = "next" | "previous";

export class JournalNavigationCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #notices = inject(NoticeService);
  readonly #index = inject(JournalsIndex);
  readonly #logger = inject(LoggerFactoryToken).named("journal-navigation");

  constructor() {
    // Available whenever the active note is connected to a journal, in either editing or
    // reading mode — navigating to an adjacent entry is meaningless on a note that belongs
    // to no journal, so hide the command rather than surface a no-op notice.
    this.#commands.register({
      id: "open-next",
      name: m.command_open_next(),
      check: () => this.#activeEntry().isSome(),
      execute: () => this.#open("next"),
    });
    this.#commands.register({
      id: "open-prev",
      name: m.command_open_previous(),
      check: () => this.#activeEntry().isSome(),
      execute: () => this.#open("previous"),
    });
  }

  #activeEntry(): Option<JournalEntry> {
    return this.#workspace.activeNote().flatMap((path) => this.#index.entryByPath(path));
  }

  #open(direction: Direction): void {
    const entry = this.#activeEntry();
    if (!entry.isSome()) return;
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
