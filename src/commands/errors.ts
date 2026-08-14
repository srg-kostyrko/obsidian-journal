export class CommandIdTakenError extends Error {
  readonly kind = "id-taken" as const;
  constructor(public readonly id: string) {
    super(`Command id already in use: ${id}`);
    this.name = "CommandIdTakenError";
  }
}

export class UnknownCommandError extends Error {
  readonly kind = "unknown-command" as const;
  constructor(public readonly id: string) {
    super(`Unknown command: ${id}`);
    this.name = "UnknownCommandError";
  }
}

export class InvalidCommandUpdateError extends Error {
  readonly kind = "invalid-update" as const;
  constructor(public readonly id: string) {
    super(`Invalid update for command ${id}`);
    this.name = "InvalidCommandUpdateError";
  }
}
