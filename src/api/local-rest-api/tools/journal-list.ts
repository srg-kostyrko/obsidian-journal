import * as v from "valibot";

import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";

import type { McpTool } from "../tool";

const entries = {};

export class JournalListTool implements McpTool {
  readonly #api = inject(JournalsApiService);

  readonly name = "journal_list";
  readonly description =
    "Lists the journals in this vault with their write type, notelet types and the questions each asks before creating a note. Call this first to learn journal names and what answers journal_note_ensure and journal_notelet_create take.";
  readonly input = entries;
  readonly annotations = { readOnlyHint: true };

  async call(arguments_: Record<string, unknown>): Promise<unknown> {
    v.parse(v.object(entries), arguments_);
    return { journals: await this.#api.listJournals() };
  }
}
