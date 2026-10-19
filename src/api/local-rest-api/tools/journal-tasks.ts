import * as v from "valibot";

import { inject } from "@/infrastructure/di";

import { JournalsApiService } from "../../journals-api";
import { requireJournal } from "../request";
import { dateEntry, journalEntry } from "../tool";

import type { McpTool } from "../tool";

const entries = {
  journal: journalEntry,
  date: dateEntry,
  source: v.optional(
    v.pipe(
      v.picklist(["note", "notelets", "both"]),
      v.description("The period's own note, its notelets, or both. Default both."),
    ),
  ),
  depth: v.optional(
    v.pipe(
      v.picklist(["literal", "rollup"]),
      v.description("rollup adds the journal's shelf-mates' periods inside this one, such as a month's days."),
    ),
  ),
  status: v.optional(
    v.pipe(
      v.string(),
      v.description(
        "open, done, all, or one status such as in-progress. Left out, the journal's own status filter applies, or open.",
      ),
    ),
  ),
};

export class JournalTasksTool implements McpTool {
  readonly #api = inject(JournalsApiService);

  readonly name = "journal_tasks";
  readonly description =
    "Lists the checkbox tasks of a journal's period — the period holding the date — exactly as a journal-tasks code block in that note would: the journal's own listing filter applies, so tasks it excludes are not returned. Each task carries its path and 0-based line; change a task with vault_patch.";
  readonly input = entries;
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  async call(arguments_: Record<string, unknown>): Promise<unknown> {
    const { journal, date, source, depth, status } = v.parse(v.object(entries), arguments_);
    await requireJournal(this.#api, journal);

    const tasks = await this.#api.tasksFor(journal, date, {
      ...(source !== undefined && { source }),
      ...(depth !== undefined && { depth }),
      ...(status !== undefined && { status }),
    });
    return { tasks };
  }
}
