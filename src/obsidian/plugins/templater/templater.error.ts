export class TemplaterError extends Error {
  public static fromCatch(error: unknown) {
    if (error instanceof TemplaterError) return error;
    return new TemplaterError(error instanceof Error ? error.message : String(error));
  }
}
