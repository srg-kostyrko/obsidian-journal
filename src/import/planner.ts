import { normalizePath } from "obsidian";

import { Calendar, CalendarDate, calendarSlice, periodOfKind, type CalendarSliceState } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { NotesService, type VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { journalDefaultsFor, type JournalConfig } from "@/journals/config";
import { freeName } from "@/journals/free-name";
import { JournalsIndex } from "@/journals/journals-index";
import { NotePathService } from "@/journals/notes/note-path";
import { JournalsRepository } from "@/journals/repository";
import { extractFromDateFormat } from "@/journals/settings/ui/use-folder-extractor";
import { formatHasWrongWeek } from "@/journals/settings/ui/wrong-week";
import { startupSlice } from "@/journals/startup/slice";
import { SettingsService } from "@/settings";

import {
  ImportSourceToken,
  type ImportSource,
  type PeriodKind,
  type SourceId,
  type SourceJournal,
  type SourceRead,
  type SourceReading,
} from "./source";

export type RowState =
  | { readonly kind: "new" }
  | { readonly kind: "set-up"; readonly journalName: string }
  | { readonly kind: "superseded"; readonly by: SourceId };

export type RowWarning =
  { readonly kind: "iso-week-under-custom-grid" } | { readonly kind: "missing-template"; readonly path: string };

export interface PlanRow {
  readonly key: string;
  readonly journal: SourceJournal;
  readonly name: string;
  readonly folder: string;
  readonly dateFormat: string;
  readonly shelf?: string;
  readonly state: RowState;
  readonly warnings: readonly RowWarning[];
}

export type WeekStartProposal =
  | { readonly kind: "unchanged" }
  | { readonly kind: "offer"; readonly next: CalendarSliceState; readonly tickedByDefault: boolean }
  | { readonly kind: "not-applicable"; readonly dow: number };

export type StartupProposal =
  | { readonly kind: "none" }
  | { readonly kind: "set"; readonly rowKey: string }
  | { readonly kind: "kept"; readonly journalName: string };

export interface ImportPlan {
  readonly readings: readonly SourceReading[];
  readonly unrecognised: readonly SourceId[];
  readonly rows: readonly PlanRow[];
  readonly shelves: readonly string[];
  readonly weekStart: WeekStartProposal;
  readonly startup: StartupProposal;
}

/** Whether a plan offers anything to preview: a journal, an unreadable source, or a week start. */
export function hasAnythingToImport(plan: ImportPlan): boolean {
  return plan.rows.length > 0 || plan.unrecognised.length > 0 || plan.weekStart.kind !== "unchanged";
}

// Periodic Notes supersedes core Daily notes for days and Calendar's weekly note for weeks, the
// same precedence the plugins apply among themselves.
const SOURCE_ORDER: readonly SourceId[] = ["periodic-notes", "calendar", "daily-notes"];
const SUPERSEDED_BY_PERIODIC_NOTES: Partial<Record<SourceId, PeriodKind>> = { "daily-notes": "day", calendar: "week" };

// A nested ternary reads ambiguously about where the parens go, so the three-way choice
// (superseded / already set up / new) is spelled out as branches instead.
function rowState(superseded: boolean, setUpBy: string | undefined): RowState {
  if (superseded) return { kind: "superseded", by: "periodic-notes" };
  if (setUpBy !== undefined) return { kind: "set-up", journalName: setUpBy };
  return { kind: "new" };
}

const SHIFT_UNIT = { day: "d", week: "w", month: "m", quarter: "q", year: "y" } as const;

// Journals names a period's note from its representative day, not its start — for a week that's
// the day whose calendar year equals the week-year (`WeekPeriod.representative` in
// `@/calendar/period-week.ts`), which a day-of-week-sensitive format renders differently from the
// start. Day/month/quarter/year periods have `representative === start`, so this changes nothing
// for them. `NotePathService.pathForDate` reaches the same value through
// `CycleService.representativeOf`; `periodOfKind` is the same computation without needing an
// existing journal to look a cycle up from.
function sourcePath(journal: SourceJournal, date: CalendarDate): string {
  const name = periodOfKind(journal.period, date).format(journal.format);
  return normalizePath(journal.folder === "" ? `${name}.md` : `${journal.folder}/${name}.md`);
}

// Two periods either side of today, and for weeks the weeks around both New Years, where a
// week-year format and a calendar-year format disagree.
function sampleDates(period: PeriodKind): CalendarDate[] {
  const today = CalendarDate.today();
  const around = [-2, -1, 0, 1, 2].map((offset) => today.shift(offset, SHIFT_UNIT[period]));
  if (period !== "week") return around;
  const newYears = [today.startOf("year"), today.shift(1, "y").startOf("year")];
  return [...around, ...newYears.flatMap((date) => [date.shift(-1, "w"), date])];
}

export class ImportPlanner {
  readonly #sources = inject(ImportSourceToken);
  readonly #journals = inject(JournalsRepository);
  readonly #paths = inject(NotePathService);
  readonly #settings = inject(SettingsService);
  readonly #calendar = inject(Calendar);
  readonly #index = inject(JournalsIndex);
  readonly #notes = inject(NotesService);
  readonly #logger = inject(LoggerFactoryToken).named("import");

  // Another plugin's getters and stores are foreign code; one that throws must not take the
  // dashboard notice down with it.
  #readSource(source: ImportSource): SourceRead {
    try {
      return source.read();
    } catch (error) {
      this.#logger.warn("could not read another plugin's settings", { source: source.id, error });
      return { kind: "unrecognised", source: source.id };
    }
  }

  #read(): { readings: SourceReading[]; unrecognised: SourceId[] } {
    const readings: SourceReading[] = [];
    const unrecognised: SourceId[] = [];
    for (const source of this.#sources) {
      const read = this.#readSource(source);
      if (read.kind === "read") readings.push(read.reading);
      else if (read.kind === "unrecognised") unrecognised.push(read.source);
    }
    readings.sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source));
    return { readings, unrecognised };
  }

  #setUpBy(journal: SourceJournal, existing: readonly JournalConfig[]): string | undefined {
    const samples = sampleDates(journal.period);
    const expected = samples.map((date) => sourcePath(journal, date));
    return existing
      .filter((config) => config.write.type === journal.period)
      .find((config) =>
        samples.every((date, index) => {
          const rendered = this.#paths.pathForDate(config.name, date);
          return rendered.isOk() && rendered.value === expected[index];
        }),
      )?.name;
  }

  #weekStart(readings: readonly SourceReading[]): WeekStartProposal {
    const hint = readings.find((reading) => reading.weekStart !== undefined)?.weekStart;
    // Calendar's "locale" is its untouched default, not a choice; offering it would undo a week
    // grid someone picked in Journals.
    if (hint?.kind !== "day") return { kind: "unchanged" };
    const current = this.#settings.getSlice(calendarSlice).state;
    if (current.mode === "custom" && current.dow === hint.dow) return { kind: "unchanged" };
    // A named weekday changes only the first day; the first-week rule stays the one in force.
    const doy = current.mode === "custom" ? current.doy : this.#calendar.localeWeek().doy;
    const firstDayInJanuary = 7 + hint.dow - doy;
    if (firstDayInJanuary < 1 || firstDayInJanuary > 7) return { kind: "not-applicable", dow: hint.dow };
    // Offered even when the locale already starts weeks on this day: that locale can be Calendar's
    // own patch of it, and only an explicit grid survives disabling Calendar. Not global: Journals
    // keeps its grid to itself so other plugins are not moved by an import.
    const next: CalendarSliceState = { mode: "custom", dow: hint.dow, doy, global: false };
    const today = CalendarDate.today().toAnchor();
    // Applying a week start re-anchors every weekly note, which is not a default to take on
    // behalf of someone who already has weekly notes. A plain for-of avoids materializing the
    // repository's generator into an array: `IterableIterator` in this project's lib setup does
    // not type the Iterator Helpers proposal's `.some()`, so that would need `.list()` spread
    // into an array first.
    let hasWeeklyNotes = false;
    for (const config of this.#journals.find().list()) {
      if (config.write.type === "week" && this.#index.findClosestAnchor(config.name, today).isSome()) {
        hasWeeklyNotes = true;
        break;
      }
    }
    return { kind: "offer", next, tickedByDefault: !hasWeeklyNotes };
  }

  #startup(rows: readonly PlanRow[]): StartupProposal {
    const flagged = rows.find((row) => row.state.kind !== "superseded" && row.journal.openAtStartup);
    if (flagged === undefined) return { kind: "none" };
    const { journalName } = this.#settings.getSlice(startupSlice).state;
    return journalName === "" ? { kind: "set", rowKey: flagged.key } : { kind: "kept", journalName };
  }

  #warnings(journal: SourceJournal, customGridAfterImport: boolean): RowWarning[] {
    const warnings: RowWarning[] = [];
    if (journal.period === "week" && customGridAfterImport && formatHasWrongWeek(journal.format)) {
      warnings.push({ kind: "iso-week-under-custom-grid" });
    }
    for (const path of journal.templates) {
      const withExtension = path.endsWith(".md") ? path : `${path}.md`;
      if (this.#notes.find(withExtension as VaultPath).isNone()) warnings.push({ kind: "missing-template", path });
    }
    return warnings;
  }

  #proposedName(journal: SourceJournal, shelved: boolean, proposedNames: Set<string>): string {
    const base =
      shelved && journal.set !== undefined
        ? m.import_journal_name_in_set({ set: journal.set, period: journal.period })
        : m.import_journal_name({ period: journal.period });
    const name = freeName(
      base,
      (index) => m.import_journal_name_indexed({ name: base, index }),
      (candidate) => this.#journals.exists(candidate) || proposedNames.has(candidate),
    );
    proposedNames.add(name);
    return name;
  }

  plan(): ImportPlan {
    const { readings, unrecognised } = this.#read();
    const existing = [...this.#journals.find().list()];
    const periodicNotes = readings.find((reading) => reading.source === "periodic-notes");
    const sets = new Set(
      (periodicNotes?.journals ?? []).flatMap((journal) => (journal.set === undefined ? [] : [journal.set])),
    );
    const shelved = sets.size > 1;
    const proposedNames = new Set<string>();

    const weekStart = this.#weekStart(readings);
    const customGridAfterImport =
      weekStart.kind === "offer"
        ? weekStart.next.mode === "custom"
        : this.#settings.getSlice(calendarSlice).state.mode === "custom";

    const rows = readings.flatMap((reading) =>
      reading.journals.map((journal): PlanRow => {
        const supersededPeriod = SUPERSEDED_BY_PERIODIC_NOTES[journal.source];
        const superseded =
          supersededPeriod === journal.period &&
          (periodicNotes?.journals.some((candidate) => candidate.period === journal.period) ?? false);
        const setUpBy = this.#setUpBy(journal, existing);
        const state = rowState(superseded, setUpBy);

        const draft = {
          ...journalDefaultsFor({ type: journal.period }),
          folder: journal.folder,
          dateFormat: journal.format,
        };
        extractFromDateFormat(draft);

        // A set-up row creates nothing, so it holds no name. A superseded row still does: it can be
        // switched on in the preview.
        const name = state.kind === "set-up" ? state.journalName : this.#proposedName(journal, shelved, proposedNames);

        return {
          key: `${journal.source}:${journal.set ?? ""}:${journal.period}`,
          journal,
          name,
          folder: draft.folder,
          dateFormat: draft.dateFormat,
          ...(shelved && journal.set !== undefined && { shelf: journal.set }),
          state,
          warnings: this.#warnings(journal, customGridAfterImport),
        };
      }),
    );

    return {
      readings,
      unrecognised,
      rows,
      shelves: shelved ? [...sets] : [],
      weekStart,
      startup: this.#startup(rows),
    };
  }
}
