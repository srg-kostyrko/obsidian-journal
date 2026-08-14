import { FlowError } from "@/infrastructure/flows";

import { describeOwner, type DecorationOwner } from "./owner";

export class UnknownDecorationError extends Error {
  readonly kind = "unknown-decoration" as const;
  constructor(
    public readonly owner: DecorationOwner,
    public readonly index: number,
  ) {
    super(`Decoration not found: ${describeOwner(owner)} index=${index}`);
    this.name = "UnknownDecorationError";
  }
}

export class UnknownDecorationOwnerError extends Error {
  readonly kind = "unknown-decoration-owner" as const;
  constructor(public readonly owner: DecorationOwner) {
    super(`Decoration owner not found: ${describeOwner(owner)}`);
    this.name = "UnknownDecorationOwnerError";
  }
}

export type DecorationLifecycleError = UnknownDecorationError | UnknownDecorationOwnerError;

export class DecorationLifecycleFlowError extends FlowError {
  readonly kind = "decoration-lifecycle" as const;
  constructor(public override readonly cause: DecorationLifecycleError) {
    super(cause.message);
    this.name = "DecorationLifecycleFlowError";
  }
}

export function toDecorationFlowError(cause: DecorationLifecycleError): DecorationLifecycleFlowError {
  return new DecorationLifecycleFlowError(cause);
}
