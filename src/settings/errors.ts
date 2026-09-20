export abstract class SettingsError extends Error {
  abstract readonly kind: string;
}

export class SettingsLoadError extends SettingsError {
  readonly kind = "settings-load-failed" as const;
  constructor(override readonly cause: unknown) {
    super("Failed to load plugin settings");
    this.name = "SettingsLoadError";
  }
}

export class SettingsSaveError extends SettingsError {
  readonly kind = "settings-save-failed" as const;
  constructor(override readonly cause: unknown) {
    super("Failed to save plugin settings");
    this.name = "SettingsSaveError";
  }
}

export class SliceKeyConflictError extends SettingsError {
  readonly kind = "slice-key-conflict" as const;
  constructor(readonly key: string) {
    super(`Settings slice key conflict: "${key}" is bound more than once`);
    this.name = "SliceKeyConflictError";
  }
}

export class MigrationFailedError extends SettingsError {
  readonly kind = "migration-failed" as const;
  constructor(
    readonly stuckAt: number,
    override readonly cause?: unknown,
  ) {
    super(`Settings migration could not reach current version (stuck at v${stuckAt})`);
    this.name = "MigrationFailedError";
  }
}

// Distinct from MigrationFailedError on purpose: the stored data is not broken, this build is
// behind it. That is the one failure a running instance must answer by refusing to write, so the
// latch keys off the type rather than off a version comparison repeated at each call site.
export class SettingsTooNewError extends SettingsError {
  readonly kind = "settings-too-new" as const;
  constructor(
    readonly storedVersion: number,
    readonly currentVersion: number,
  ) {
    super(`Settings were saved by a newer version of the plugin (v${storedVersion} > v${currentVersion})`);
    this.name = "SettingsTooNewError";
  }
}

export class UnregisteredSliceError extends SettingsError {
  readonly kind = "unregistered-slice" as const;
  constructor(readonly key: string) {
    super(`Settings slice "${key}" was not registered`);
    this.name = "UnregisteredSliceError";
  }
}

export class DuplicateBlockKeyError extends SettingsError {
  readonly kind = "duplicate-block-key" as const;
  constructor(readonly key: string) {
    super(`Settings dashboard block key conflict: "${key}" is bound more than once`);
    this.name = "DuplicateBlockKeyError";
  }
}

export class DuplicateSubpageKeyError extends SettingsError {
  readonly kind = "duplicate-subpage-key" as const;
  constructor(readonly key: string) {
    super(`Settings subpage key conflict: "${key}" is bound more than once`);
    this.name = "DuplicateSubpageKeyError";
  }
}

export class UnregisteredSubpageError extends SettingsError {
  readonly kind = "unregistered-subpage" as const;
  constructor(readonly key: string) {
    super(`Settings subpage "${key}" was not registered`);
    this.name = "UnregisteredSubpageError";
  }
}

export class SnapshotUnreadableError extends SettingsError {
  readonly kind = "snapshot-unreadable" as const;
  constructor(
    readonly snapshotName: string,
    override readonly cause?: unknown,
  ) {
    super(`Snapshot "${snapshotName}" could not be read`);
    this.name = "SnapshotUnreadableError";
  }
}
