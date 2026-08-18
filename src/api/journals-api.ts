import type { CalendarDate, AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { WorkspaceOpenError } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { NoteFileService } from "@/infrastructure/host/internal/note-file-service";
import { CycleService } from "@/journals/cycle";
import { EnsureJournalEntryFlow, JournalDateResolver, OpenJournalEntryFlow } from "@/journals/flows";
import type { ApplicableJournal } from "@/journals/flows";
import { FrontmatterService } from "@/journals/frontmatter";
import { JournalsIndex } from "@/journals/journals-index";
import { NotePathService } from "@/journals/notes/note-path";
import { JournalsRepository } from "@/journals/repository";
import { TimelineService } from "@/journals/timeline";
import { ShelvesService } from "@/shelves/service";

import { normalizeSelector, toCalendarDate, toJournalInfo } from "./convert";
import { ApiError } from "./errors";

import type {
  DateInput,
  EnsureNoteOptions,
  EnsureResult,
  ExistingJournalNote,
  JournalInfo,
  JournalNote,
  JournalSelector,
  OpenNoteOptions,
} from "./public-api";

const API_VERSION = 1;

function describeDateInput(input: DateInput): string {
  if (typeof input === "string") return `"${input}"`;
  if (input instanceof Date) return "an invalid Date";
  return "the given date-like value";
}

export class JournalsApiService {
  readonly #journals = inject(JournalsRepository);
  readonly #shelves = inject(ShelvesService);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);
  readonly #index = inject(JournalsIndex);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #paths = inject(NotePathService);
  readonly #files = inject(NoteFileService);
  readonly #resolver = inject(JournalDateResolver);
  readonly #flows = inject(Flows);
  readonly #inFlight = new Map<string, Promise<EnsureResult>>();

  readonly apiVersion = API_VERSION;

  // listJournals/journalInfo read the settings-backed repository, which is populated before
  // `api` is even assigned; only the index reads wait, because the index is filled by a
  // whole-vault walk that takes seconds and answers "no note" for real notes until it lands.
  async #readyForNotes(): Promise<void> {
    await this.#index.whenReady();
  }

  #date(input: DateInput): CalendarDate {
    const parsed = toCalendarDate(input);
    if (parsed.isNone()) throw new ApiError("invalid-date", `Could not read a date from ${describeDateInput(input)}`);
    return parsed.value;
  }

  #select(selector: JournalSelector | undefined): string[] {
    const normalized = normalizeSelector(selector);
    return [...this.#journals.find().entries()]
      .filter(([name, config]) => {
        if (normalized.journal !== undefined && normalized.journal !== name) return false;
        if (normalized.writeType !== undefined && normalized.writeType !== config.write.type) return false;
        if (normalized.shelf !== undefined && (normalized.shelf ?? "") !== this.#shelves.shelfOf(name)) return false;
        return true;
      })
      .map(([name]) => name);
  }

  #renderedPath(name: string, anchor: AnchorString): string | null {
    const metadata = this.#frontmatter.buildMetadata(name, anchor);
    if (metadata.kind === "err") return null;
    const path = this.#paths.pathFor(name, metadata.value);
    return path.kind === "err" ? null : path.value;
  }

  // A connected note the user has since moved keeps its real path; the rendered template
  // answers only for a note that does not exist yet.
  #pathOf(name: string, anchor: AnchorString, existingPath: string | null): string | null {
    if (existingPath !== null) return existingPath;
    return this.#timeline.contains(name, anchor) ? this.#renderedPath(name, anchor) : null;
  }

  #noteAt(name: string, date: CalendarDate): JournalNote | null {
    const anchorOption = this.#cycle.anchorOf(name, date);
    if (anchorOption.isNone()) return null;
    return this.#noteAtAnchor(name, anchorOption.value);
  }

  #noteAtAnchor(name: string, anchor: AnchorString): JournalNote | null {
    const display = this.#cycle.representativeOf(name, anchor);
    const end = this.#cycle.endOf(name, anchor);
    if (display.isNone() || end.isNone()) return null;

    const entry = this.#index.entryByAnchor(name, anchor);
    const existingPath = entry.isSome() ? entry.value.path : null;

    return {
      journal: name,
      date: anchor,
      displayDate: display.value.toAnchor(),
      endDate: end.value.toAnchor(),
      path: this.#pathOf(name, anchor, existingPath),
      file: existingPath === null ? null : this.#files.resolve(existingPath),
    };
  }

  // Eligibility is "a note exists OR the date is in timeline", not the resolver's
  // timeline-only rule. Refusing a note the API just reported as existing would make
  // `ensure` a lie; the calendar's stricter gate is a UI affordance, not a data rule.
  #eligible(names: readonly string[], date: CalendarDate): ApplicableJournal[] {
    return names.flatMap((name) => {
      const resolved = this.#cycle.anchorOf(name, date);
      if (resolved.isNone()) return [];
      const anchor = resolved.value;
      const exists = this.#index.entryByAnchor(name, anchor).isSome();
      if (!exists && !this.#timeline.contains(name, anchor)) return [];
      return [{ name, anchor }];
    });
  }

  async #resolveOne(selector: JournalSelector, date: DateInput): Promise<ApplicableJournal> {
    const calendarDate = this.#date(date);
    const names = this.#select(selector);
    if (names.length === 0) {
      const normalized = normalizeSelector(selector);
      if (normalized.journal !== undefined && this.#journals.get(normalized.journal).isNone()) {
        throw new ApiError("journal-not-found", `Journal not found: ${normalized.journal}`, normalized.journal);
      }
      throw new ApiError("no-matching-journal", "No journal matches that selector");
    }

    const eligible = this.#eligible(names, calendarDate);
    if (eligible.length === 0) {
      // "No period for that date" means the journal is misconfigured for this input;
      // "a period, out of range" is a different answer callers act on differently.
      const mappable = names.some((name) => this.#cycle.anchorOf(name, calendarDate).isSome());
      throw mappable
        ? new ApiError("outside-timeline", "That date is outside the journal's timeline")
        : new ApiError("unmappable-date", "That date cannot be placed in a period of that journal");
    }

    const [only] = eligible;
    if (eligible.length === 1 && only !== undefined) return only;

    const chosen = await this.#resolver.pick(eligible.map((entry) => entry.name));
    if (chosen === null) throw new ApiError("aborted", "The journal picker was dismissed");
    const match = eligible.find((entry) => entry.name === chosen);
    if (match === undefined) throw new ApiError("no-matching-journal", `No journal named ${chosen} matched`);
    return match;
  }

  #existing(name: string, anchor: AnchorString): ExistingJournalNote {
    const note = this.#noteAtAnchor(name, anchor);
    if (note?.path == null || note.file === null) {
      throw new ApiError("creation-failed", `The note for ${name} could not be read back`, name);
    }
    return { ...note, path: note.path, file: note.file };
  }

  // Between the existence check and the write, NoteCreationService may await a confirmation
  // modal — seconds wide. Two callers ensuring the same period would otherwise get two
  // prompts and one NoteAlreadyExistsError.
  #dedupe(name: string, anchor: AnchorString, run: () => Promise<EnsureResult>): Promise<EnsureResult> {
    const key = `${name}\u{0}${anchor}`;
    const pending = this.#inFlight.get(key);
    if (pending) return pending;
    const started = run().finally(() => this.#inFlight.delete(key));
    this.#inFlight.set(key, started);
    return started;
  }

  #skipConfirmation(options: EnsureNoteOptions | undefined): boolean | undefined {
    return options?.confirm === undefined ? undefined : !options.confirm;
  }

  #toApiError(cause: unknown, journal: string): ApiError {
    if (cause instanceof UserAborted) return new ApiError("aborted", "The operation was cancelled", journal);
    if (cause instanceof WorkspaceOpenError) return new ApiError("open-failed", cause.message, journal);
    return new ApiError("creation-failed", cause instanceof Error ? cause.message : String(cause), journal);
  }

  async listJournals(selector?: JournalSelector): Promise<readonly JournalInfo[]> {
    return this.#select(selector).flatMap((name) => {
      const config = this.#journals.get(name);
      return config.isNone() ? [] : [toJournalInfo(name, config.value, this.#shelves.shelfOf(name))];
    });
  }

  async journalInfo(name: string): Promise<JournalInfo | null> {
    const config = this.#journals.get(name);
    return config.isNone() ? null : toJournalInfo(name, config.value, this.#shelves.shelfOf(name));
  }

  async notesFor(selector: JournalSelector, date: DateInput): Promise<readonly JournalNote[]> {
    await this.#readyForNotes();
    const calendarDate = this.#date(date);
    // A journal that cannot place this date is omitted rather than failing the fan-out.
    return this.#select(selector).flatMap((name) => {
      const note = this.#noteAt(name, calendarDate);
      return note === null ? [] : [note];
    });
  }

  async ensureNote(selector: JournalSelector, date: DateInput, options?: EnsureNoteOptions): Promise<EnsureResult> {
    await this.#readyForNotes();
    const { name, anchor } = await this.#resolveOne(selector, date);
    return this.#dedupe(name, anchor, async () => {
      const result = await this.#flows.invoke(
        EnsureJournalEntryFlow,
        { journalName: name, anchor, skipConfirmation: this.#skipConfirmation(options) },
        { notify: false, context: { via: "api" } },
      );
      if (result.isErr()) throw this.#toApiError(result.error, name);
      return { note: this.#existing(name, anchor), created: result.value.created };
    });
  }

  async openNote(selector: JournalSelector, date: DateInput, options?: OpenNoteOptions): Promise<EnsureResult> {
    await this.#readyForNotes();
    const { name, anchor } = await this.#resolveOne(selector, date);
    return this.#dedupe(name, anchor, async () => {
      const result = await this.#flows.invoke(
        OpenJournalEntryFlow,
        {
          journalName: name,
          anchor,
          openMode: options?.openMode,
          skipConfirmation: this.#skipConfirmation(options),
        },
        { notify: false, context: { via: "api" } },
      );
      if (result.isErr()) throw this.#toApiError(result.error, name);
      return { note: this.#existing(name, anchor), created: result.value.created };
    });
  }

  async journalOf(file: { path: string }): Promise<ExistingJournalNote | null> {
    await this.#readyForNotes();
    const entry = this.#index.entryByPath(file.path as VaultPath);
    if (entry.isNone()) return null;
    const note = this.#noteAtAnchor(entry.value.journalName, entry.value.anchor);
    if (note === null) return null;
    // We were handed the file; re-resolving entry.path would add a null branch that
    // conflates "not a journal note" with a resolution hiccup.
    return { ...note, path: entry.value.path, file: file as ExistingJournalNote["file"] };
  }
}
