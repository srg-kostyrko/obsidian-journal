import * as v from "valibot";

import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { noteJson } from "../json";
import { requireJournal } from "../request";
import { answersEntry, creatingForAgent, dateEntry, journalEntry } from "../tool";

import type { McpTool } from "../tool";

const entries = { journal: journalEntry, date: dateEntry, answers: answersEntry };

export class NoteEnsureTool implements McpTool {
  readonly #api = inject(JournalsApiService);

  readonly name = "journal_note_ensure";
  readonly description =
    "Returns the journal's note for the period containing a date, creating it from the journal's template first if it does not exist yet. Returns the vault path and whether it was created; read or edit it with vault_read, vault_patch or vault_append.";
  readonly input = entries;
  readonly annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  async call(arguments_: Record<string, unknown>): Promise<unknown> {
    const { journal, date, answers } = v.parse(v.object(entries), arguments_);
    await requireJournal(this.#api, journal);
    const result = await creatingForAgent(
      this.#api.ensureNote(journal, date, { prompt: false, confirm: false, answers }),
    );
    return { ...noteJson(result.note), created: result.created };
  }
}
