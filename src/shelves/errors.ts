import { FlowError } from "@/infrastructure/flows";
import type { UnknownJournalError } from "@/journals/settings/errors";

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

export type ShelvesLifecycleError =
  | InvalidShelfNameError
  | ShelfNameTakenError
  | UnknownShelfError
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
