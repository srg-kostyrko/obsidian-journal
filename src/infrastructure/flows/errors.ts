export abstract class FlowError extends Error {
  abstract readonly kind: string;
}

export class UserAborted extends FlowError {
  readonly kind = "user-aborted" as const;
  constructor(readonly source: string) {
    super(`User aborted at ${source}`);
    this.name = "UserAborted";
  }
}

export class UnexpectedFlowError extends FlowError {
  readonly kind = "unexpected" as const;
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "UnexpectedFlowError";
  }
}

export interface BenignFlowError {
  readonly benign: true;
}

export function isBenignFlowError(error: unknown): error is BenignFlowError {
  return typeof error === "object" && error !== null && "benign" in error && error.benign === true;
}

export interface UserFacingFlowError {
  readonly userNotice: string;
}

export function isUserFacingFlowError(error: unknown): error is UserFacingFlowError {
  return typeof error === "object" && error !== null && "userNotice" in error && typeof error.userNotice === "string";
}
