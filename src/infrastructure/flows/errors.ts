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
