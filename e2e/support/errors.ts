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

export class NoSpilloverDayError extends Error {
  constructor() {
    super("no outside-month day cell rendered in three consecutive months");
    this.name = "NoSpilloverDayError";
  }
}

export class NativeMenuUnavailableError extends Error {
  constructor() {
    super("electron.remote.Menu is unavailable, so native menus cannot be captured");
    this.name = "NativeMenuUnavailableError";
  }
}

export class NativeMenuItemMissingError extends Error {
  constructor(menuIndex: number, itemIndex: number) {
    super(`no clickable item at index ${String(itemIndex)} of captured native menu ${String(menuIndex)}`);
    this.name = "NativeMenuItemMissingError";
  }
}

export class UpdateLinksDialogButtonMissingError extends Error {
  constructor() {
    super('Obsidian\'s "Update links?" dialog did not render its expected three-button layout');
    this.name = "UpdateLinksDialogButtonMissingError";
  }
}

export class RenameRequiresLinkUpdateError extends Error {
  constructor(from: string, to: string) {
    super(
      `renaming ${from} to ${to} opened Obsidian's native "Update links?" dialog — this note has an inbound link, use renameNoteAcceptingLinkUpdates instead of renameNote`,
    );
    this.name = "RenameRequiresLinkUpdateError";
  }
}

export class RenameFileFailedError extends Error {
  constructor(from: string, to: string, reason: string) {
    super(`renaming ${from} to ${to} failed in the renderer: ${reason}`);
    this.name = "RenameFileFailedError";
  }
}

export class NoteNotOpenError extends Error {
  constructor(path: string) {
    super(`no open tab holds ${path}`);
    this.name = "NoteNotOpenError";
  }
}

export class HostPluginNotLoadedError extends Error {
  constructor(id: string) {
    super(`the ${id} plugin was installed and enabled but never loaded`);
    this.name = "HostPluginNotLoadedError";
  }
}
