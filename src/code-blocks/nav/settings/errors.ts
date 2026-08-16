import { FlowError } from "@/infrastructure/flows";

export class UnknownNavSegmentError extends Error {
  readonly kind = "unknown-nav-segment" as const;
  constructor(
    public readonly journalName: string,
    // Which kind of index was out of range — a line index and a segment index are validated
    // separately in edit-nav-segment.flow.ts, and without this the message can't say which one
    // actually failed.
    public readonly target: "line" | "segment",
    public readonly index: number,
  ) {
    super(`Nav block ${target} not found: journal=${journalName} index=${index}`);
    this.name = "UnknownNavSegmentError";
  }
}

export type NavSegmentLifecycleError = UnknownNavSegmentError;

export class NavSegmentLifecycleFlowError extends FlowError {
  readonly kind = "nav-segment-lifecycle" as const;
  constructor(public override readonly cause: NavSegmentLifecycleError) {
    super(cause.message);
    this.name = "NavSegmentLifecycleFlowError";
  }
}

export function toNavSegmentFlowError(cause: NavSegmentLifecycleError): NavSegmentLifecycleFlowError {
  return new NavSegmentLifecycleFlowError(cause);
}
