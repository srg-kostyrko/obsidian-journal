import { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { CycleService } from "../cycle";
import { OpenJournalEntryFlow } from "../flows/open-journal-entry.flow";
import { JournalsRepository } from "../repository";
import { JournalsEventsToken } from "../tokens";

import { startupSlice } from "./slice";

export class StartupOpenService {
  readonly #workspace = inject(WorkspaceService);
  readonly #flows = inject(Flows);
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #events = inject(JournalsEventsToken);
  readonly #logger = inject(LoggerFactoryToken).named("startup-open");

  readonly #slice = inject(SettingsService).getSlice(startupSlice);

  constructor() {
    this.#events.on("renamed", (oldName, newName) => {
      const { journalName, overrides } = this.#slice.state;
      if (journalName !== oldName && overrides.every((entry) => entry.journalName !== oldName)) return;
      this.#slice.state = {
        journalName: journalName === oldName ? newName : journalName,
        overrides: overrides.map((entry) =>
          entry.journalName === oldName ? { ...entry, journalName: newName } : entry,
        ),
      };
    });
    this.#events.on("deleted", (name) => {
      const { journalName, overrides } = this.#slice.state;
      if (journalName !== name && overrides.every((entry) => entry.journalName !== name)) return;
      // An override loses its whole entry rather than its name: blanking the name would silently
      // turn "open Private on Saturday" into "open nothing on Saturday", where dropping the entry
      // lets the day fall back to the default journal. The default itself has nothing to fall back
      // to, so it still clears to "".
      this.#slice.state = {
        journalName: journalName === name ? "" : journalName,
        overrides: overrides.filter((entry) => entry.journalName !== name),
      };
    });
  }

  // The settings UI stops a day being claimed twice, so overlapping overrides only reach here from
  // a hand-edited data.json or a sync merge: the first entry claiming today wins.
  #journalNameFor(today: CalendarDate): string {
    const weekday = Number(today.format("d"));
    const override = this.#slice.state.overrides.find((entry) => entry.weekdays.includes(weekday));
    return override?.journalName ?? this.#slice.state.journalName;
  }

  async #open(): Promise<void> {
    const today = CalendarDate.today();
    const journalName = this.#journalNameFor(today);
    if (journalName === "" || !this.#journals.exists(journalName)) return;
    // Resolve today to the journal period's canonical anchor so the opened/created note's
    // frontmatter date is the one parseEntry accepts (a raw mid-period date orphans the note).
    const anchorOpt = this.#cycle.anchorOf(journalName, today);
    if (anchorOpt.isNone()) return;
    const anchor = anchorOpt.value;
    const result = await this.#flows.invoke(OpenJournalEntryFlow, { journalName, anchor, openMode: "active" });
    if (result.isErr() && !(result.error instanceof UserAborted)) {
      this.#logger.error("startup-open: failed to open note", { journalName, error: result.error });
    }
  }

  initialize(): AsyncResult<void, never> {
    const appStartup = !this.#workspace.layoutReady;
    this.#workspace.onLayoutReady(() => {
      if (!appStartup) return;
      void this.#open();
    });
    return AsyncResult.ok();
  }
}
