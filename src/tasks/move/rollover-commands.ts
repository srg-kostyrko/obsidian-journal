import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import { CommandService, defineSuggest, NoticeService, SuggestService, WorkspaceService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { JournalsIndex, JournalsRepository } from "@/journals";

import { NoCurrentPeriodError } from "./errors";
import { rollNotice } from "./report";
import { RolloverService } from "./rollover-service";

const rollJournalPicker = defineSuggest<string[], string>({
  placeholder: () => m.command_roll_over_pick_journal(),
  fetch: (query, journals) => journals.filter((name) => name.toLowerCase().includes(query.toLowerCase())),
  render: (name) => name,
});

export class RolloverCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #notices = inject(NoticeService);
  readonly #suggests = inject(SuggestService);
  readonly #index = inject(JournalsIndex);
  readonly #journals = inject(JournalsRepository);
  readonly #rollover = inject(RolloverService);
  readonly #logger = inject(LoggerFactoryToken).named("rollover");

  constructor() {
    this.#commands.register({
      id: "roll-over",
      name: m.command_roll_over(),
      check: () => true,
      execute: () => void this.#run(),
    });
  }

  async #journalName(): Promise<string | null> {
    // The note open at the press, not whichever is open once the wait ends.
    const pressedIn = this.#workspace.activeNote();
    // Commands register before the startup scan lands, and until then the index is empty rather
    // than authoritative: the open note would read as no journal's, and the roll would find no earlier note.
    await this.#index.whenReady();
    const active = pressedIn.flatMap((path) => this.#index.entryByPath(path));
    if (active.isSome()) return active.value.journalName;
    const names = [...this.#journals.find().ids()];
    if (names.length === 0) {
      this.#notices.show(m.common_no_journals_yet());
      return null;
    }
    const picked = await this.#suggests.open(rollJournalPicker, names);
    return picked.isOk() ? picked.value : null;
  }

  async #run(): Promise<void> {
    const name = await this.#journalName();
    if (name === null) return;
    const result = await this.#rollover.roll(name, { interactive: true });
    if (result.isOk()) {
      this.#notices.show(rollNotice(result.value));
      return;
    }
    const error = result.error;
    if (error instanceof UserAborted) return;
    if (error instanceof NoCurrentPeriodError) {
      this.#notices.show(m.tasks_roll_no_current_period());
      return;
    }
    this.#logger.error("rolling tasks forward failed", { journalName: name, error });
    this.#notices.show(m.tasks_roll_failed());
  }
}
