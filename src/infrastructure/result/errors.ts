export class InvariantError extends Error {
  readonly kind = "invariant" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvariantError";
  }
}
