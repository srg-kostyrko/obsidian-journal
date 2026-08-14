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
      if (this.#slice.state.journalName === oldName) {
        this.#slice.state = { journalName: newName };
      }
    });
    this.#events.on("deleted", (name) => {
      if (this.#slice.state.journalName === name) {
        this.#slice.state = { journalName: "" };
      }
    });
  }

  async #open(): Promise<void> {
    const { journalName } = this.#slice.state;
    if (journalName === "" || !this.#journals.exists(journalName)) return;
    // Resolve today to the journal period's canonical anchor so the opened/created note's
    // frontmatter date is the one parseEntry accepts (a raw mid-period date orphans the note).
    const anchorOpt = this.#cycle.anchorOf(journalName, CalendarDate.today());
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
