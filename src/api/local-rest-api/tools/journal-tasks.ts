import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { taskDateChoices } from "@/tasks/date-choice";

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
  taskDate: v.optional(
    v.pipe(
      v.picklist(taskDateChoices),
      v.description(
        "Which of a task's dates puts a task matched by date in the listing for the period: due, scheduled, start, done, created, or scheduled-or-due (default).",
      ),
    ),
  ),
};

export class JournalTasksTool implements McpTool {
  readonly #api = inject(JournalsApiService);

  readonly name = "journal_tasks";
  readonly description =
    "Lists the tasks of a journal's period — the period holding the date — exactly as a journal-tasks code block in that note would: checkbox tasks in the note and its notelets, plus tasks matched to the period by date (task notes, and checkbox lines carrying a date). The journal's own listing filter applies, so tasks it excludes are not returned. Each task carries its path and a 0-based line (null for a task note). relations lists every way a task can be placed, not how it was found: \"containment\" for a task in a journal's note or notelet, \"date\" for one carrying a date, so a dated line in the period's own note has both. Change a task with vault_patch.";
  readonly input = entries;
  readonly annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  async call(arguments_: Record<string, unknown>): Promise<unknown> {
    const { journal, date, source, depth, status, taskDate } = v.parse(v.object(entries), arguments_);
    await requireJournal(this.#api, journal);

    const tasks = await this.#api.tasksFor(journal, date, {
      ...(source !== undefined && { source }),
      ...(depth !== undefined && { depth }),
      ...(status !== undefined && { status }),
      ...(taskDate !== undefined && { date: taskDate }),
    });
    return { tasks };
  }
}
