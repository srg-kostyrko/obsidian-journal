export class VaultError extends Error {
  public static fromCatch(error: unknown) {
    if (error instanceof VaultError) return error;
    return new VaultError(error instanceof Error ? error.message : String(error));
  }
}
