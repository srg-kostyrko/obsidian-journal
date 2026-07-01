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

export interface BenignFlowError {
  readonly benign: true;
}

export function isBenignFlowError(error: unknown): error is BenignFlowError {
  return typeof error === "object" && error !== null && "benign" in error && error.benign === true;
}
