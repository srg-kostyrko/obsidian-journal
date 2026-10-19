import { CalendarDate, Clock } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NoteWriteError, NoticeService, NotesService } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
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

  toggle(item: TaskItem): AsyncResult<void, TickError> {
    const state = this.#settings.state;
    // A recurring series is advanced by the plugin that owns it, off the completion of its current
    // note; a bare status write would complete the note and silently end the series.
    const meta = this.#metadata.get(item.path);
    if (meta.isSome() && isRecurring(meta.value.properties, state.recurrenceProperties)) {
      this.#notices.show(m.tasks_tick_recurring_task_note());
      return AsyncResult.err(new RecurringUnsupportedError(item.path));
    }

    const target = tickTargetStatus(item.status);
    const canonical: string | undefined = state.canonical[target];
    if (canonical === undefined || canonical.trim() === "") return AsyncResult.err(new NoCanonicalSymbolError(target));

    const completedProperty = state.dates.done ?? "";
    const modifiedProperty = state.modifiedProperty;
    return this.#notes
      .updateFrontmatter(item.path, (frontmatter) => {
        frontmatter[state.statusProperty] = statusValue(canonical);
        if (completedProperty !== "") {
          if (isDone(target)) frontmatter[completedProperty] = CalendarDate.today().toAnchor();
          else delete frontmatter[completedProperty];
        }
        if (modifiedProperty !== "") frontmatter[modifiedProperty] = Clock.now().format("YYYY-MM-DDTHH:mm:ss");
      })
      .mapErr((error): TickError =>
        error.kind === "frontmatter-failed" ? new NoteWriteError(item.path, error.cause) : error,
      );
  }
}
