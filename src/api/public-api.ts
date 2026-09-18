import type { TFile } from "obsidian";

/** Anything with toDate() — notably a moment, which is what Obsidian hands out. */
export interface DateLike {
  toDate(): Date;
}

/** "YYYY-MM-DD", "today", a relative shift like "+1w" / "-3d", a Date, or a moment. */
export type DateInput = Date | DateLike | string;

/** A window of dates, inclusive of both ends. */
export interface DateRange {
  readonly from: DateInput;
  readonly to: DateInput;
}

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

/** A question a journal or notelet type asks before it creates a note. */
export interface PromptInfo {
  readonly variable: string;
  readonly question: string;
  readonly type: "text" | "number" | "date" | "toggle" | "select" | "note";
  readonly required: boolean;
  /** The note name or folder uses the answer, so creating without it fails. */
  readonly inPath: boolean;
  readonly multiline: boolean;
  readonly options: readonly { readonly label: string; readonly value: string }[];
}

/** A notelet type and the questions it asks. */
export interface NoteletTypeInfo {
  readonly name: string;
  readonly prompts: readonly PromptInfo[];
}

/** One problem with the answers a call supplied. */
export interface AnswerIssue {
  readonly variable: string;
  readonly reason: string;
}

export interface JournalInfo {
  readonly name: string;
  readonly shelf: string | null;
  readonly write: JournalWrite;
  /** The journal's notelet type names, sorted. Empty when the journal defines none. */
  readonly notelets: readonly string[];
  /** The questions this journal asks before creating a period note. */
  readonly prompts: readonly PromptInfo[];
  /** Each notelet type with its questions, sorted by name. `notelets` stays the list of names. */
  readonly noteletTypes: readonly NoteletTypeInfo[];
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
   * fails with `prompts-required` instead of hanging. Supply `answers` instead to
   * create such a note without asking.
   */
  readonly prompt?: boolean;
  /**
   * Answers keyed by each question's `variable` — see `JournalInfo.prompts`. Implies no modal:
   * neither the questions nor the creation confirmation are shown. Fails with `invalid-answers`
   * listing every problem. Ignored, though still checked, when the note already exists.
   */
  readonly answers?: Readonly<Record<string, unknown>>;
}

export interface OpenNoteOptions extends EnsureNoteOptions {
  readonly openMode?: "active" | "tab" | "split" | "window";
  /** Open in the journal's pinned tab, moving it to this note; pins a new tab when there is none. */
  readonly pinned?: boolean;
}

export interface EnsureResult {
  readonly note: ExistingJournalNote;
  readonly created: boolean;
}

export interface CreateNoteletOptions {
  /** Show the type's creation-confirmation prompt. Defaults to the type's own setting. */
  readonly confirm?: boolean;
  /** Ask the type's creation prompts. Defaults to true. */
  readonly prompt?: boolean;
  /** Omit to create without opening; pass a mode to create and show. */
  readonly openMode?: "active" | "tab" | "split" | "window";
  /**
   * Answers keyed by each question's `variable` — see `NoteletTypeInfo.prompts`. Implies no
   * modal: neither the questions nor the creation confirmation are shown. Fails with
   * `invalid-answers` listing every problem.
   */
  readonly answers?: Readonly<Record<string, unknown>>;
}

export interface OpenNoteletOptions {
  readonly openMode?: "active" | "tab" | "split" | "window";
}

/** Open on purpose: new codes are an additive change, so always handle the default case. */
export type JournalsApiErrorCode =
  | "journal-not-found"
  | "no-matching-journal"
  | "invalid-date"
  | "unmappable-date"
  | "outside-timeline"
  | "notelet-type-not-found"
  | "creation-failed"
  | "prompts-required"
  | "invalid-answers"
  | "open-failed"
  | "aborted"
  | "plugin-unloaded"
  | (string & {});

export interface JournalsApiError extends Error {
  readonly code: JournalsApiErrorCode;
  readonly journal?: string;
  /** Set on `invalid-answers`: every rejected, unknown or missing answer. */
  readonly issues?: readonly AnswerIssue[];
}

export interface JournalsApiEvents {
  journalCreated: (event: { journal: string }) => void;
  journalRenamed: (event: { from: string; to: string }) => void;
  journalDeleted: (event: { journal: string }) => void;
  noteAdded: (event: { journal: string; date: string; path: string }) => void;
  noteRemoved: (event: { journal: string; date: string; path: string }) => void;
  noteletAdded: (event: { journal: string; date: string; type: string; path: string }) => void;
  noteletRemoved: (event: { journal: string; date: string; type: string; path: string }) => void;
}

export interface JournalsApi {
  readonly apiVersion: number;

  listJournals(selector?: JournalSelector): Promise<readonly JournalInfo[]>;
  journalInfo(name: string): Promise<JournalInfo | null>;

  notesFor(selector: JournalSelector, date: DateInput): Promise<readonly JournalNote[]>;
  /** Every period the window overlaps, whether or not a note is there. One entry per period. */
  notesInRange(selector: JournalSelector, range: DateRange): Promise<readonly JournalNote[]>;
  /** Only the notes on disk. Omit the range for every note the matched journals have written. */
  existingNotes(selector: JournalSelector, range?: DateRange): Promise<readonly ExistingJournalNote[]>;
  journalOf(file: TFile): Promise<ExistingJournalNote | null>;
  noteletOf(file: TFile): Promise<NoteletNote | null>;
  noteletsFor(
    selector: JournalSelector,
    date: DateInput,
    options?: { readonly type?: string },
  ): Promise<readonly NoteletNote[]>;
  noteletsInRange(
    selector: JournalSelector,
    range: DateRange,
    options?: { readonly type?: string },
  ): Promise<readonly NoteletNote[]>;
  createNotelet(
    selector: JournalSelector,
    date: DateInput,
    type: string,
    options?: CreateNoteletOptions,
  ): Promise<NoteletNote>;
  openNotelet(notelet: NoteletNote, options?: OpenNoteletOptions): Promise<void>;

  ensureNote(selector: JournalSelector, date: DateInput, options?: EnsureNoteOptions): Promise<EnsureResult>;
  openNote(selector: JournalSelector, date: DateInput, options?: OpenNoteOptions): Promise<EnsureResult>;

  /** Synchronous — returns its unsubscribe disposer. */
  on<K extends keyof JournalsApiEvents>(event: K, handler: JournalsApiEvents[K]): () => void;
}
