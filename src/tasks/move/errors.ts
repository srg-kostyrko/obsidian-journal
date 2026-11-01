import type { UserAborted } from "@/infrastructure/flows";
import type { NoteNotFoundError, NoteWriteError, VaultPath } from "@/infrastructure/host";
import type { JournalNotFoundError } from "@/journals/errors";
import type { NoteCreationError } from "@/journals/notes/note-creation";

export class NoCurrentPeriodError extends Error {
  readonly kind = "no-current-period" as const;

  constructor(readonly journalName: string) {
    super(`Journal ${journalName} writes no period for today`);
    this.name = "NoCurrentPeriodError";
  }
}

export class AutomaticRollRefusedError extends Error {
  readonly kind = "automatic-roll-refused" as const;

  constructor(
    readonly journalName: string,
    readonly reason: "not-automatic" | "copy-without-stamp",
  ) {
    super(`Journal ${journalName} cannot roll automatically: ${reason}`);
    this.name = "AutomaticRollRefusedError";
  }
}

export type RollError =
  | AutomaticRollRefusedError
  | JournalNotFoundError
  | NoCurrentPeriodError
  | NoteCreationError
  | NoteNotFoundError
  | NoteWriteError
  | UnsavedEditError;

export class SingleMoveRefusedError extends Error {
  readonly kind = "single-move-refused" as const;

  constructor(readonly reason: "not-a-task" | "rolled" | "same-note") {
    super(`The task under the cursor cannot be moved: ${reason}`);
    this.name = "SingleMoveRefusedError";
  }
}

export type SingleMoveError =
  | JournalNotFoundError
  | NoteCreationError
  | NoteNotFoundError
  | NoteWriteError
  | SingleMoveRefusedError
  | UnsavedEditError
  | UserAborted;

// The open view holds the change but its save failed: disk still has the note as it was, and the view
// will write the change whenever it next saves.
export class UnsavedEditError extends Error {
  readonly kind = "unsaved-edit" as const;

  constructor(
    readonly path: VaultPath,
    readonly cause: NoteWriteError,
  ) {
    super(`${path} was changed in its open view, but the view could not be saved`);
    this.name = "UnsavedEditError";
  }
}
