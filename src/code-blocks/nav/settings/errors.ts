import { FlowError } from "@/infrastructure/flows";

export class UnknownNavRowError extends Error {
  readonly kind = "unknown-nav-row" as const;
  constructor(
    public readonly journalName: string,
    public readonly index: number,
  ) {
    super(`Nav block row not found: journal=${journalName} index=${index}`);
    this.name = "UnknownNavRowError";
  }
}

export type NavRowLifecycleError = UnknownNavRowError;

export class NavRowLifecycleFlowError extends FlowError {
  readonly kind = "nav-row-lifecycle" as const;
  constructor(public override readonly cause: NavRowLifecycleError) {
    super(cause.message);
    this.name = "NavRowLifecycleFlowError";
  }
}

export function toNavRowFlowError(cause: NavRowLifecycleError): NavRowLifecycleFlowError {
  return new NavRowLifecycleFlowError(cause);
}
