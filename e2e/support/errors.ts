export class FixtureFileMissingError extends Error {
  constructor(path: string) {
    super(`no fixture file at ${path}`);
    this.name = "FixtureFileMissingError";
  }
}
