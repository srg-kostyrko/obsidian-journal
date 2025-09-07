export class VaultError extends Error {
  public static fromCatch(error: unknown) {
    return new VaultError(error instanceof Error ? error.message : String(error));
  }
}
