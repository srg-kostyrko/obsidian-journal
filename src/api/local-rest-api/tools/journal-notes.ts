import * as v from "valibot";

import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { noteJson, noteletJson } from "../json";
import { requireJournal } from "../request";
import { dateEntry, journalEntry } from "../tool";

import type { McpTool } from "../tool";

const entries = {
  journal: journalEntry,
  from: dateEntry,
  to: v.optional(dateEntry),
  type: v.optional(v.pipe(v.string(), v.description("Only notelets of this type."))),
};

export class JournalNotesTool implements McpTool {
  readonly #api = inject(JournalsApiService);

  readonly name = "journal_notes";
  readonly description =
    "Finds a journal's existing notes and notelets for one day or a date range, without creating anything. A single date also finds the week, month or other period note that contains it. Returns vault paths; read or edit a note with vault_read, vault_patch or vault_append.";
  readonly input = entries;
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  async call(arguments_: Record<string, unknown>): Promise<unknown> {
    const { journal, from, to, type } = v.parse(v.object(entries), arguments_);
    await requireJournal(this.#api, journal);

    const range = { from, to: to ?? from };
    const [notes, notelets] = await Promise.all([
      this.#api.existingNotes(journal, range),
      this.#api.noteletsInRange(journal, range, type === undefined ? undefined : { type }),
    ]);
    return { notes: notes.map(noteJson), notelets: notelets.map(noteletJson) };
  }
}
