import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { CommandService, NoticeService, WorkspaceService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { Option } from "@/infrastructure/result";

import { JournalsIndex } from "./journals-index";
import { periodEntryOf } from "./types";

import type { JournalEntry } from "./types";

type Direction = "next" | "previous";

export class JournalNavigationCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #notices = inject(NoticeService);
  readonly #index = inject(JournalsIndex);
  readonly #logger = inject(LoggerFactoryToken).named("journal-navigation");

  constructor() {
    // Listed whenever the active note is connected to a journal, in either editing or reading
    // mode — navigating to an adjacent entry is meaningless on a note that belongs to no
    // journal, so the palette hides the command. A bound hotkey still reaches execute, which
    // says so rather than swallowing the press.
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
    return this.#workspace
      .activeNote()
      .flatMap((path) => this.#index.entryByPath(path))
      .flatMap(periodEntryOf);
  }

  #open(direction: Direction): void {
    const entry = this.#activeEntry();
    if (!entry.isSome()) {
      this.#notices.show(m.command_open_needs_active_note());
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
      this.#notices.show(m.common_note_open_error());
    });
  }
}
