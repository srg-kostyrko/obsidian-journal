import { FlowError } from "@/infrastructure/flows";

export class UnknownDecorationError extends Error {
  readonly kind = "unknown-decoration" as const;
  constructor(
    public readonly journalName: string,
    public readonly index: number,
  ) {
    super(`Decoration not found: journal=${journalName} index=${index}`);
    this.name = "UnknownDecorationError";
  }
}

export type DecorationLifecycleError = UnknownDecorationError;

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
