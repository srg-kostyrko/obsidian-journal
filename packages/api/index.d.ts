// Generated from src/api/public-api.ts by scripts/build-api-types.mjs.
// Do not edit by hand — run `npm run build:api`.

import type { TFile } from "obsidian";

/** Anything with toDate() — notably a moment, which is what Obsidian hands out. */
export interface DateLike {
  toDate(): Date;
}

/** "YYYY-MM-DD", "today", a relative shift like "+1w" / "-3d", a Date, or a moment. */
export type DateInput = Date | DateLike | string;

export type JournalWriteType = "day" | "week" | "month" | "quarter" | "year" | "custom";

/**
 * Selects journals. A bare string is shorthand for { journal: name }.
 * Fields are ANDed; an empty selector matches every journal.
 */
export type JournalSelector =
  | string
  | {
      readonly journal?: string;
      readonly writeType?: JournalWriteType;
      /** undefined = any shelf; null = journals on no shelf; a name = that shelf. */
      readonly shelf?: string | null;
    };

export type JournalWrite =
  | { readonly type: "day" | "week" | "month" | "quarter" | "year" }
  | {
      readonly type: "custom";
      readonly every: "day" | "week" | "month" | "quarter" | "year";
      readonly duration: number;
    };

export interface JournalInfo {
  readonly name: string;
  readonly shelf: string | null;
  readonly write: JournalWrite;
  /** The journal's notelet type names, sorted. Empty when the journal defines none. */
  readonly notelets: readonly string[];
}

/** The journal's note for a period — on disk, or where it would go. */
export interface JournalNote {
  readonly journal: string;
  /** "YYYY-MM-DD" — the period's first day, and its identity. The note's `journal-date`. */
  readonly date: string;
  /**
   * "YYYY-MM-DD" — the day this period's dates are formatted from. Equals `date` for every
   * period kind except a week: the ISO week containing 2026-01-01 has date 2025-12-29 but
   * displayDate 2026-01-01, and is named 2026-W01. Format from this; correlate on `date`.
   */
  readonly displayDate: string;
  /** "YYYY-MM-DD" — the period's last day, inclusive. The note's `journal-end-date`. */
  readonly endDate: string;
  /** Where the note is, or would be created. null = no note can be placed here. */
  readonly path: string | null;
  /** null = not created yet. */
  readonly file: TFile | null;
}

/** A JournalNote that exists on disk. */
export interface ExistingJournalNote extends JournalNote {
  readonly path: string;
  readonly file: TFile;
}

/** A notelet attached to a journal period. Always exists on disk. */
export interface NoteletNote {
  readonly journal: string;
  /** The type's name, as stored in the note's frontmatter. */
  readonly type: string;
  /** "YYYY-MM-DD" — the period's first day. Correlates with JournalNote.date. */
  readonly date: string;
  /** The period's, derived from the anchor — a notelet stores neither this nor endDate. */
  readonly displayDate: string;
  readonly endDate: string;
  readonly path: string;
  readonly file: TFile;
  /** The assigned counter, when the type has one. Orders siblings within a period. */
  readonly counter: number | null;
}

export interface EnsureNoteOptions {
  /** Show the journal's creation-confirmation prompt. Defaults to the journal's own setting. */
  readonly confirm?: boolean;
  /**
   * Ask the journal's creation prompts. Defaults to true, since a caller is typically
   * user-triggered and asking is what makes this behave like the UI. Pass false when the
   * call must not block on a modal; a journal that cannot proceed without an answer then
   * fails with `prompts-required` instead of hanging. There is no way to supply answers
   * programmatically — see the Errors section.
   */
  readonly prompt?: boolean;
}

export interface OpenNoteOptions extends EnsureNoteOptions {
  readonly openMode?: "active" | "tab" | "split" | "window";
}

export interface EnsureResult {
  readonly note: ExistingJournalNote;
  readonly created: boolean;
}

/** Open on purpose: new codes are an additive change, so always handle the default case. */
export type JournalsApiErrorCode =
  | "journal-not-found"
  | "no-matching-journal"
  | "invalid-date"
  | "unmappable-date"
  | "outside-timeline"
  | "creation-failed"
  | "prompts-required"
  | "open-failed"
  | "aborted"
  | "plugin-unloaded"
  | (string & {});

export interface JournalsApiError extends Error {
  readonly code: JournalsApiErrorCode;
  readonly journal?: string;
}

export interface JournalsApiEvents {
  journalCreated: (event: { journal: string }) => void;
  journalRenamed: (event: { from: string; to: string }) => void;
  journalDeleted: (event: { journal: string }) => void;
  noteAdded: (event: { journal: string; date: string; path: string }) => void;
  noteRemoved: (event: { journal: string; date: string; path: string }) => void;
}

export interface JournalsApi {
  readonly apiVersion: number;

  listJournals(selector?: JournalSelector): Promise<readonly JournalInfo[]>;
  journalInfo(name: string): Promise<JournalInfo | null>;

  notesFor(selector: JournalSelector, date: DateInput): Promise<readonly JournalNote[]>;
  journalOf(file: TFile): Promise<ExistingJournalNote | null>;
  noteletOf(file: TFile): Promise<NoteletNote | null>;
  noteletsFor(
    selector: JournalSelector,
    date: DateInput,
    options?: { readonly type?: string },
  ): Promise<readonly NoteletNote[]>;

  ensureNote(selector: JournalSelector, date: DateInput, options?: EnsureNoteOptions): Promise<EnsureResult>;
  openNote(selector: JournalSelector, date: DateInput, options?: OpenNoteOptions): Promise<EnsureResult>;

  /** Synchronous — returns its unsubscribe disposer. */
  on<K extends keyof JournalsApiEvents>(event: K, handler: JournalsApiEvents[K]): () => void;
}

/**
 * Returns the Journals plugin API, or null when Journals is not installed, not enabled, or
 * older than the release that introduced the API.
 *
 * Call this at the point of use rather than caching it: there is no readiness event, and
 * reloading the plugin replaces the object.
 */
export declare function getJournalsApi(app: import("obsidian").App): JournalsApi | null;
