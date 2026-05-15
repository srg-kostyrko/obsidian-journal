export class JournalsError extends Error {
  override name = "JournalsError";
}

export class JournalNotFoundError extends JournalsError {
  override name = "JournalNotFoundError";

  constructor(readonly journalName: string) {
    super(`Journal not found: ${journalName}`);
  }
}
