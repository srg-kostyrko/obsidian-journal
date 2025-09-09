export class SettingsPersistenceError extends Error {
  public static fromCatch(error: unknown) {
    if (error instanceof SettingsPersistenceError) return error;
    return new SettingsPersistenceError(error instanceof Error ? error.message : String(error));
  }
}
