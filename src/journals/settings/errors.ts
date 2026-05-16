import { FlowError } from "@/infrastructure/flows";

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

export type JournalLifecycleError =
  | InvalidJournalNameError
  | JournalNameTakenError
  | UnknownJournalError
  | UnknownSequenceSourceError;

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
