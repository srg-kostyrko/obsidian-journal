import { FlowError } from "@/infrastructure/flows";

export class JournalsError extends Error {
  override name = "JournalsError";
}

export class JournalNotFoundError extends JournalsError {
  override name = "JournalNotFoundError";

  constructor(readonly journalName: string) {
    super(`Journal not found: ${journalName}`);
  }
}

export class InvalidJournalNameError extends Error {
  readonly kind = "invalid-name" as const;
  constructor(public readonly attemptedName: string) {
    super(`Invalid journal name: ${JSON.stringify(attemptedName)}`);
    this.name = "InvalidJournalNameError";
  }
}

export class JournalNameTakenError extends Error {
  readonly kind = "name-taken" as const;
  constructor(public readonly name: string) {
    super(`Journal name already in use: ${name}`);
  }
}

export class UnknownJournalError extends Error {
  readonly kind = "unknown-journal" as const;
  constructor(public readonly journalName: string) {
    super(`Unknown journal: ${journalName}`);
    this.name = "UnknownJournalError";
  }
}

export class UnknownSequenceSourceError extends Error {
  readonly kind = "unknown-sequence-source" as const;
  constructor(
    public readonly journalName: string,
    public readonly sourceIndex: number,
  ) {
    super(`Unknown sequence source ${sourceIndex} on journal ${journalName}`);
    this.name = "UnknownSequenceSourceError";
  }
}

export class InvalidJournalUpdateError extends Error {
  readonly kind = "invalid-update" as const;
  constructor(public readonly journalName: string) {
    super(`Invalid update for journal ${journalName}: name field is immutable via update — use rename`);
    this.name = "InvalidJournalUpdateError";
  }
}

export type JournalLifecycleError =
  | InvalidJournalNameError
  | JournalNameTakenError
  | UnknownJournalError
  | UnknownSequenceSourceError
  | InvalidJournalUpdateError;

export class JournalLifecycleFlowError extends FlowError {
  readonly kind = "journal-lifecycle" as const;
  constructor(public override readonly cause: JournalLifecycleError) {
    super(cause.message);
    this.name = "JournalLifecycleFlowError";
  }
}

export function toFlowError(cause: JournalLifecycleError): JournalLifecycleFlowError {
  return new JournalLifecycleFlowError(cause);
}
