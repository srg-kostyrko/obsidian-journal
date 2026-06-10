export class FixtureFileMissingError extends Error {
  constructor(path: string) {
    super(`no fixture file at ${path}`);
    this.name = "FixtureFileMissingError";
  }
}

export class PluginDataMissingError extends Error {
  constructor(path: string) {
    super(`no persisted plugin data at ${path}`);
    this.name = "PluginDataMissingError";
  }
}
