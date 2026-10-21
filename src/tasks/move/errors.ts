import type { NoteNotFoundError, NoteWriteError } from "@/infrastructure/host";
import type { JournalNotFoundError } from "@/journals/errors";
import type { NoteCreationError } from "@/journals/notes/note-creation";

export class NoCurrentPeriodError extends Error {
  readonly kind = "no-current-period" as const;

  constructor(readonly journalName: string) {
    super(`Journal ${journalName} writes no period for today`);
    this.name = "NoCurrentPeriodError";
  }
}

export type RollError =
  JournalNotFoundError | NoCurrentPeriodError | NoteCreationError | NoteNotFoundError | NoteWriteError;
