import type { BenignFlowError } from "@/infrastructure/flows";
import type { NoteNotFoundError, NoteWriteError, VaultPath } from "@/infrastructure/host";

import type { TaskStatus } from "./types";

export class TaskLineMovedError extends Error {
  readonly kind = "task-line-moved" as const;

  constructor(
    readonly path: VaultPath,
    readonly line: number,
  ) {
    super(`Line ${line} of ${path} no longer holds the task it was read from`);
    this.name = "TaskLineMovedError";
  }
}

export class NotATaskLineError extends Error {
  readonly kind = "not-a-task-line" as const;

  constructor(readonly path: VaultPath) {
    super(`Item in ${path} has no task line to tick`);
    this.name = "NotATaskLineError";
  }
}

export class NoCanonicalSymbolError extends Error {
  readonly kind = "no-canonical-symbol" as const;

  constructor(readonly status: TaskStatus) {
    super(`No marker is configured for ${status}`);
    this.name = "NoCanonicalSymbolError";
  }
}

// Benign: `NoApplicableJournals` is the documented precedent for this shape (CLAUDE.md) — the
// service already shows its own notice at the point the outcome is otherwise invisible, so a flow
// wrapping `toggle()` must stay silent on it rather than layering `flow_failure_notice` on top.
export class RecurringUnsupportedError extends Error implements BenignFlowError {
  readonly kind = "recurring-unsupported" as const;
  readonly benign = true as const;

  constructor(readonly path: VaultPath) {
    super(`${path} carries a recurring task and the Tasks plugin is not available to advance it`);
    this.name = "RecurringUnsupportedError";
  }
}

export type TickError =
  | TaskLineMovedError
  | NotATaskLineError
  | NoCanonicalSymbolError
  | RecurringUnsupportedError
  | NoteNotFoundError
  | NoteWriteError;

// Thrown out of the note-property frontmatter mutator to abort the write; never leaves that provider.
export class RecurringAtWrite extends Error {}
