import type { ImportOutcome, RowOutcome } from "./import-service";
import type { PeriodKind } from "./source";

function noop(): undefined {
  return undefined;
}

export interface PeriodicConfigShape {
  enabled: boolean;
  openAtStartup: boolean;
  format: string;
  folder: string;
  templatePath: string;
}

export function buildPeriodicConfig(overrides: Partial<PeriodicConfigShape> = {}): PeriodicConfigShape {
  return { enabled: true, openAtStartup: false, format: "", folder: "", templatePath: "", ...overrides };
}

export function buildCalendarSet(
  id: string,
  periods: Partial<Record<PeriodKind, PeriodicConfigShape>> = {},
): Record<string, unknown> {
  return { id, ctime: "2026-01-01T00:00:00+00:00", ...periods };
}

/** A Periodic Notes 1.x plugin instance: settings live behind a Svelte-style store. */
export function periodicNotesStorePlugin(settings: object): {
  settings: { subscribe: (run: (value: unknown) => void) => () => void };
} {
  return {
    settings: {
      subscribe(run) {
        run(settings);
        return noop;
      },
    },
  };
}

export function buildImportOutcome(rows: RowOutcome[]): ImportOutcome {
  return { snapshotWritten: true, weekStartApplied: false, shelves: [], rows, startup: { kind: "none" } };
}
