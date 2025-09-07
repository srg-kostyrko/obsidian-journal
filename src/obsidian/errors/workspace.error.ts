export class WorkspaceError extends Error {
  public static fromCatch(error: unknown) {
    if (error instanceof WorkspaceError) return error;
    return new WorkspaceError(error instanceof Error ? error.message : String(error));
  }
}
