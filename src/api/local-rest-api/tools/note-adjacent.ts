import * as v from "valibot";

import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { noteJson } from "../json";
import { requireJournal } from "../request";
import { dateEntry, journalEntry } from "../tool";

import type { McpTool } from "../tool";

const entries = {
  journal: journalEntry,
  date: dateEntry,
  direction: v.pipe(v.picklist(["previous", "next"]), v.description("Which side of the date to look on.")),
};

export class NoteAdjacentTool implements McpTool {
  readonly #api = inject(JournalsApiService);

  readonly name = "journal_note_adjacent";
  readonly description =
    "Finds a journal's nearest existing note before or after the period holding a date, skipping periods that have no note — so previous from today is the last note written, not necessarily yesterday's. Creates nothing. Returns { note: null } when there is no note on that side.";
  readonly input = entries;
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  async call(arguments_: Record<string, unknown>): Promise<unknown> {
    const { journal, date, direction } = v.parse(v.object(entries), arguments_);
    await requireJournal(this.#api, journal);

    const notes =
      direction === "previous" ? await this.#api.previousNote(journal, date) : await this.#api.nextNote(journal, date);
    const note = notes.at(0);
    return { note: note === undefined ? null : noteJson(note) };
  }
}
