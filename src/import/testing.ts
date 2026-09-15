import { SOURCE_DEFAULT_FORMATS, type PeriodKind, type SourceJournal } from "./source";

import type { ImportOutcome, RowOutcome } from "./import-service";
import type { ImportPlan, PlanRow } from "./planner";

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

export function buildSourceJournal(overrides: Partial<SourceJournal> = {}): SourceJournal {
  return {
    source: "periodic-notes",
    period: "day",
    folder: "",
    format: SOURCE_DEFAULT_FORMATS.day,
    templates: [],
    openAtStartup: false,
    ...overrides,
  };
}

export function buildPlanRow(overrides: Partial<PlanRow> = {}): PlanRow {
  const journal = overrides.journal ?? buildSourceJournal();
  return {
    key: `${journal.source}:${journal.set ?? ""}:${journal.period}`,
    journal,
    name: "Daily",
    folder: journal.folder,
    dateFormat: journal.format,
    state: { kind: "new" },
    warnings: [],
    ...overrides,
  };
}

export function buildImportPlan(overrides: Partial<ImportPlan> = {}): ImportPlan {
  const rows = overrides.rows ?? [buildPlanRow()];
  const sources = [...new Set(rows.map((row) => row.journal.source))];
  return {
    readings: sources.map((source) => ({
      source,
      configured: true,
      journals: rows.filter((row) => row.journal.source === source).map((row) => row.journal),
    })),
    unrecognised: [],
    rows,
    shelves: [],
    weekStart: { kind: "unchanged" },
    startup: { kind: "none" },
    ...overrides,
  };
}
