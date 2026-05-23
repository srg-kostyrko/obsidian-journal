import { FlowError } from "@/infrastructure/flows";
import type { UnknownJournalError } from "@/journals/errors";

export class InvalidShelfNameError extends Error {
  readonly kind = "invalid-name" as const;
  constructor(public readonly attemptedName: string) {
    super(`Invalid shelf name: ${JSON.stringify(attemptedName)}`);
    this.name = "InvalidShelfNameError";
  }
}

export class ShelfNameTakenError extends Error {
  readonly kind = "name-taken" as const;
  constructor(public readonly name: string) {
    super(`Shelf name already in use: ${name}`);
    this.name = "ShelfNameTakenError";
  }
}

export class UnknownShelfError extends Error {
  readonly kind = "unknown-shelf" as const;
  constructor(public readonly shelfName: string) {
    super(`Unknown shelf: ${shelfName}`);
    this.name = "UnknownShelfError";
  }
}

export class InvalidShelfUpdateError extends Error {
  readonly kind = "invalid-update" as const;
  constructor(public readonly shelfName: string) {
    super(`Invalid update for shelf ${shelfName}: name field is immutable via update — use rename`);
    this.name = "InvalidShelfUpdateError";
  }
}

export type ShelvesLifecycleError =
  | InvalidShelfNameError
  | ShelfNameTakenError
  | UnknownShelfError
  | InvalidShelfUpdateError
  | UnknownJournalError;

export class ShelvesLifecycleFlowError extends FlowError {
  readonly kind = "shelves-lifecycle" as const;
  constructor(public override readonly cause: ShelvesLifecycleError) {
    super(cause.message);
    this.name = "ShelvesLifecycleFlowError";
  }
}

export function toFlowError(cause: ShelvesLifecycleError): ShelvesLifecycleFlowError {
  return new ShelvesLifecycleFlowError(cause);
}
