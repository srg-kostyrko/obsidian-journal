export class MissingUriTargetError extends Error {
  readonly kind = "missing-target" as const;

  constructor() {
    super("URI is missing a journal or type parameter");
    this.name = "MissingUriTargetError";
  }
}

export class UnknownUriWriteTypeError extends Error {
  readonly kind = "unknown-write-type" as const;

  constructor(readonly value: string) {
    super(`Unknown journal type in URI: ${value}`);
    this.name = "UnknownUriWriteTypeError";
  }
}

export class InvalidUriDateError extends Error {
  readonly kind = "invalid-date" as const;

  constructor(readonly value: string) {
    super(`Could not parse date in URI: ${value}`);
    this.name = "InvalidUriDateError";
  }
}

export class InvalidUriOpenModeError extends Error {
  readonly kind = "invalid-mode" as const;

  constructor(readonly value: string) {
    super(`Unknown open mode in URI: ${value}`);
    this.name = "InvalidUriOpenModeError";
  }
}

export type UriError = MissingUriTargetError | UnknownUriWriteTypeError | InvalidUriDateError | InvalidUriOpenModeError;
