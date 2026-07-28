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

export class UriHandlerMissingError extends Error {
  constructor() {
    super('no "journals" obsidian:// protocol handler was registered at boot');
    this.name = "UriHandlerMissingError";
  }
}

export class NoFreeDayError extends Error {
  constructor() {
    super("every day of the current month already has a note");
    this.name = "NoFreeDayError";
  }
}

export class FixtureJournalMissingError extends Error {
  constructor(name: string) {
    super(`fixture is missing the "${name}" journal`);
    this.name = "FixtureJournalMissingError";
  }
}
