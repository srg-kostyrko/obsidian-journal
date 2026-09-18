import * as v from "valibot";

import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { noteletJson } from "../json";
import { requireJournal } from "../request";
import { answersEntry, dateEntry, journalEntry } from "../tool";

import type { McpTool } from "../tool";

const entries = {
  journal: journalEntry,
  date: dateEntry,
  type: v.pipe(v.string(), v.description("The notelet type's name.")),
  answers: answersEntry,
};

export class NoteletCreateTool implements McpTool {
  readonly #api = inject(JournalsApiService);

  readonly name = "journal_notelet_create";
  readonly description =
    "Creates a new notelet of a type for a date. Every call creates another notelet, so do not retry a call that succeeded. Returns the new note's vault path; edit it with vault_patch or vault_append.";
  readonly input = entries;
  readonly annotations = { idempotentHint: false };

  async call(arguments_: Record<string, unknown>): Promise<unknown> {
    const { journal, date, type, answers } = v.parse(v.object(entries), arguments_);
    await requireJournal(this.#api, journal);
    const notelet = await this.#api.createNotelet(journal, date, type, { prompt: false, confirm: false, answers });
    return noteletJson(notelet);
  }
}
