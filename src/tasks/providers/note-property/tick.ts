import { Clock } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import {
  NoteMetadataService,
  NoteNotFoundError,
  NoteWriteError,
  NoticeService,
  NotesService,
} from "@/infrastructure/host";
import { AsyncResult, Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { isDone, tickTargetStatus } from "../../status";
import { NoCanonicalSymbolError, RecurringUnsupportedError, type TickError } from "../../tick-errors";

import { isRecurring } from "./read";
import { notePropertySlice } from "./slice";

import type { TaskItem } from "../../types";

// TaskNotes stores the statuses "true" and "false" as YAML booleans (coerceStatusFrontmatterValue
// in TaskNotes' model package); writing the string back would make its own reader see a different value.
function statusValue(canonical: string): string | boolean {
  if (canonical === "true") return true;
  if (canonical === "false") return false;
  return canonical;
}

/**
 * Ticks a task note by writing its status property, never its body.
 */
export class NotePropertyTicker {
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #notices = inject(NoticeService);
  readonly #settings = inject(SettingsService).getSlice(notePropertySlice);

  #recurringRefusal(item: TaskItem): RecurringUnsupportedError {
    this.#notices.show(m.tasks_tick_recurring_task_note());
    return new RecurringUnsupportedError(item.path);
  }

  toggle(item: TaskItem): AsyncResult<void, TickError> {
    const state = this.#settings.state;
    // A recurring series is advanced by the plugin that owns it, off the completion of its current
    // note; a bare status write would complete the note and silently end the series.
    // With no metadata, recurrence cannot be ruled out, and a wrong guess ends a series silently.
    const meta = this.#metadata.get(item.path);
    if (meta.isNone()) return AsyncResult.err(new NoteNotFoundError(item.path));
    if (isRecurring(meta.value.properties, state.recurrenceProperties)) {
      return AsyncResult.err(this.#recurringRefusal(item));
    }

    const target = tickTargetStatus(item.status);
    const canonical: string | undefined = state.canonical[target];
    if (canonical === undefined || canonical.trim() === "") return AsyncResult.err(new NoCanonicalSymbolError(target));

    const completedProperty = state.dates.done ?? "";
    const modifiedProperty = state.modifiedProperty;
    // One reading of the clock, so a tick at midnight cannot stamp two different days.
    const now = Clock.now();
    // The cache can lag the file — a sync or an edit may have made the note recurring since it was
    // last read — so the frontmatter the write is handed gets the same check.
    let recurring = false;
    return this.#notes
      .updateFrontmatter(item.path, (frontmatter) => {
        if (isRecurring(frontmatter, state.recurrenceProperties)) {
          recurring = true;
          return;
        }
        frontmatter[state.statusProperty] = statusValue(canonical);
        if (completedProperty !== "") {
          if (isDone(target)) frontmatter[completedProperty] = now.format("YYYY-MM-DD");
          else delete frontmatter[completedProperty];
        }
        if (modifiedProperty !== "") frontmatter[modifiedProperty] = now.format("YYYY-MM-DDTHH:mm:ssZ");
      })
      .mapErr((error): TickError =>
        error.kind === "frontmatter-failed" ? new NoteWriteError(item.path, error.cause) : error,
      )
      .flatMap((): Result<void, TickError> => (recurring ? new Err(this.#recurringRefusal(item)) : new Ok(undefined)));
  }
}
