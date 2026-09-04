import { match } from "ts-pattern";

import type { CalendarDate, AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { WorkspaceOpenError, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { NoteFileService } from "@/infrastructure/host/internal/note-file-service";
import { Option } from "@/infrastructure/result";
import { CycleService } from "@/journals/cycle";
import { NoteletTypeNotFoundError, OutOfTimelineError } from "@/journals/errors";
import { EnsureJournalEntryFlow, JournalDateResolver, OpenJournalEntryFlow } from "@/journals/flows";
import type { ApplicableJournal } from "@/journals/flows";
import { FrontmatterService } from "@/journals/frontmatter";
import { JournalsIndex } from "@/journals/journals-index";
import { noteletTypeByName } from "@/journals/notelets/config";
import { CreateNoteletFlow } from "@/journals/notelets/flows/create-notelet.flow";
import { buildNoteletListing } from "@/journals/notelets/listing";
import { NotePathService } from "@/journals/notes/note-path";
import { PromptsUnansweredError } from "@/journals/prompts/errors";
import { JournalsRepository } from "@/journals/repository";
import { TimelineService } from "@/journals/timeline";
import { JournalsEventsToken } from "@/journals/tokens";
import { isNotelet, periodEntryOf } from "@/journals/types";
import type { NoteletEntry } from "@/journals/types";
import { ShelvesService } from "@/shelves/service";

import { normalizeSelector, toCalendarDate, toJournalInfo } from "./convert";
import { ApiError } from "./errors";

import type {
  CreateNoteletOptions,
  DateInput,
  EnsureNoteOptions,
  EnsureResult,
  ExistingJournalNote,
  JournalInfo,
  JournalNote,
  JournalSelector,
  JournalsApi,
  JournalsApiEvents,
  NoteletNote,
  OpenNoteletOptions,
  OpenNoteOptions,
} from "./public-api";
import type { TFile } from "obsidian";

const API_VERSION = 1;

function describeDateInput(input: DateInput): string {
  if (typeof input === "string") return `"${input}"`;
  if (input instanceof Date) return "an invalid Date";
  return "the given date-like value";
}

export class JournalsApiService implements JournalsApi {
  readonly #journals = inject(JournalsRepository);
  readonly #journalEvents = inject(JournalsEventsToken);
  readonly #shelves = inject(ShelvesService);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);
  readonly #index = inject(JournalsIndex);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #paths = inject(NotePathService);
  readonly #files = inject(NoteFileService);
  readonly #resolver = inject(JournalDateResolver);
  readonly #flows = inject(Flows);
  readonly #workspace = inject(WorkspaceService);
  readonly #inFlight = new Map<string, Promise<EnsureResult>>();
  readonly #unloaded: Promise<never>;
  #rejectUnloaded: ((reason: unknown) => void) | undefined;
  #disposed = false;

  readonly apiVersion = API_VERSION;

  constructor() {
    this.#unloaded = new Promise<never>((_, reject) => {
      this.#rejectUnloaded = reject;
    });
    // Nothing may be awaiting it at disposal time; without a terminal handler that
    // rejection surfaces as an unhandled rejection in the host.
    void this.#unloaded.catch(() => null);
  }

  #assertLoaded(): void {
    if (this.#disposed) throw new ApiError("plugin-unloaded", "Journals has been unloaded");
  }

  // listJournals/journalInfo read the settings-backed repository, which is populated before
  // `api` is even assigned; only the index reads wait, because the index is filled by a
  // whole-vault walk that takes seconds and answers "no note" for real notes until it lands.
  async #readyForNotes(): Promise<void> {
    this.#assertLoaded();
    // whenReady never settles if readiness never arrives, so a consumer awaiting a call
    // when the user disables Journals would hang forever inside their own plugin.
    await Promise.race([this.#index.whenReady(), this.#unloaded]);
    this.#assertLoaded();
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

  // The same rule as NotePathService.resolvedPathFor, spelled out here because the entry lookup
  // is already done for `file` and the timeline gate applies only to the rendered branch:
  // a connected note the user has since moved keeps its real path, and the rendered template
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

  #periodDates(name: string, anchor: AnchorString): { displayDate: string; endDate: string } | null {
    const display = this.#cycle.representativeOf(name, anchor);
    const end = this.#cycle.endOf(name, anchor);
    if (display.isNone() || end.isNone()) return null;
    return { displayDate: display.value.toAnchor(), endDate: end.value.toAnchor() };
  }

  #noteletFrom(entry: NoteletEntry, file: TFile): NoteletNote | null {
    const dates = this.#periodDates(entry.journalName, entry.anchor);
    if (dates === null) return null;
    return {
      journal: entry.journalName,
      type: entry.typeName,
      date: entry.anchor,
      ...dates,
      path: entry.path,
      file,
      counter: entry.counter ?? null,
    };
  }

  #noteAtAnchor(name: string, anchor: AnchorString): JournalNote | null {
    const dates = this.#periodDates(name, anchor);
    if (dates === null) return null;

    const entry = this.#index.entryByAnchor(name, anchor);
    const existingPath = entry.isSome() ? entry.value.path : null;

    return {
      journal: name,
      date: anchor,
      ...dates,
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

  // Notelet creation always requires the timeline, so a journal that could only fail must not
  // reach the picker. The period rule ("a note exists OR in timeline") exists so `ensure` cannot
  // refuse a note the API just reported; there is no equivalent here.
  #eligibleForNotelet(names: readonly string[], date: CalendarDate): ApplicableJournal[] {
    return names.flatMap((name) => {
      const resolved = this.#cycle.anchorOf(name, date);
      if (resolved.isNone()) return [];
      return this.#timeline.contains(name, resolved.value) ? [{ name, anchor: resolved.value }] : [];
    });
  }

  async #resolveOne(
    selector: JournalSelector,
    date: DateInput,
    eligibility: "existing-or-timeline" | "timeline" = "existing-or-timeline",
  ): Promise<ApplicableJournal> {
    const calendarDate = this.#date(date);
    const names = this.#select(selector);
    if (names.length === 0) {
      const normalized = normalizeSelector(selector);
      if (normalized.journal !== undefined && this.#journals.get(normalized.journal).isNone()) {
        throw new ApiError("journal-not-found", `Journal not found: ${normalized.journal}`, normalized.journal);
      }
      throw new ApiError("no-matching-journal", "No journal matches that selector");
    }

    const eligible =
      eligibility === "timeline" ? this.#eligibleForNotelet(names, calendarDate) : this.#eligible(names, calendarDate);
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

  // Built from the write's own result, never re-read through the index: JournalsIndex only
  // learns about a new note once Obsidian re-parses its frontmatter, so a lookup here
  // reports `file: null` for the note we just created.
  #existing(name: string, anchor: AnchorString, path: string): ExistingJournalNote {
    const dates = this.#periodDates(name, anchor);
    const file = this.#files.resolve(path);
    if (dates === null || file === null) {
      throw new ApiError("creation-failed", `The note for ${name} could not be read back`, name);
    }
    return { journal: name, date: anchor, ...dates, path, file };
  }

  // Built from the write's own result, never re-read through the index — a notelet the index has
  // not re-parsed yet reports as missing.
  #createdNotelet(
    name: string,
    anchor: AnchorString,
    typeName: string,
    path: string,
    counter: number | null,
  ): NoteletNote {
    const dates = this.#periodDates(name, anchor);
    const file = this.#files.resolve(path);
    if (dates === null || file === null) {
      throw new ApiError("creation-failed", `The notelet for ${name} could not be read back`, name);
    }
    return { journal: name, type: typeName, date: anchor, ...dates, path, file, counter };
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

  #unattended(options: { readonly prompt?: boolean } | undefined): boolean | undefined {
    return options?.prompt === false;
  }

  #toApiError(cause: unknown, journal: string): ApiError {
    if (cause instanceof UserAborted) return new ApiError("aborted", "The operation was cancelled", journal);
    if (cause instanceof WorkspaceOpenError) return new ApiError("open-failed", cause.message, journal);
    if (cause instanceof PromptsUnansweredError) return new ApiError("prompts-required", cause.message, journal);
    return new ApiError("creation-failed", cause instanceof Error ? cause.message : String(cause), journal);
  }

  // Its own wrapper rather than a widened #toApiError: mapping OutOfTimelineError there would
  // change what ensureNote and openNote answer today. Both branches are unreachable in a single
  // uninterrupted call — #resolveOne's "timeline" eligibility and the type-name guard above both
  // refuse first — and stay as the point-of-write defense for a config edited mid-flight.
  #toNoteletApiError(cause: unknown, journal: string): ApiError {
    if (cause instanceof OutOfTimelineError) {
      return new ApiError("outside-timeline", cause.message, journal);
    }
    if (cause instanceof NoteletTypeNotFoundError) {
      return new ApiError("notelet-type-not-found", cause.message, journal);
    }
    return this.#toApiError(cause, journal);
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
        {
          journalName: name,
          anchor,
          skipConfirmation: this.#skipConfirmation(options),
          unattended: this.#unattended(options),
        },
        { notify: false, context: { via: "api" } },
      );
      if (result.isErr()) throw this.#toApiError(result.error, name);
      return { note: this.#existing(name, anchor, result.value.path), created: result.value.created };
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
          unattended: this.#unattended(options),
        },
        { notify: false, context: { via: "api" } },
      );
      if (result.isErr()) throw this.#toApiError(result.error, name);
      return { note: this.#existing(name, anchor, result.value.path), created: result.value.created };
    });
  }

  async createNotelet(
    selector: JournalSelector,
    date: DateInput,
    type: string,
    options?: CreateNoteletOptions,
  ): Promise<NoteletNote> {
    await this.#readyForNotes();
    const { name, anchor } = await this.#resolveOne(selector, date, "timeline");
    const config = this.#journals.get(name);
    const found = config.isNone() ? Option.none() : noteletTypeByName(config.value, type);
    if (found.isNone()) {
      throw new ApiError("notelet-type-not-found", `Journal ${name} has no notelet type named ${type}`, name);
    }
    const [typeId, noteletType] = found.value;
    // No #dedupe: notelet creation is never idempotent, so two concurrent calls must produce two
    // notelets rather than collapsing onto one.
    const result = await this.#flows.invoke(
      CreateNoteletFlow,
      {
        journalName: name,
        typeId,
        anchor,
        openMode: options?.openMode ?? null,
        unattended: this.#unattended(options),
      },
      { notify: false, context: { via: "api" } },
    );
    if (result.isErr()) throw this.#toNoteletApiError(result.error, name);
    return this.#createdNotelet(name, anchor, noteletType.name, result.value.path, result.value.counter ?? null);
  }

  async openNotelet(notelet: NoteletNote, options?: OpenNoteletOptions): Promise<void> {
    // The caller already holds the notelet, so nothing here reads the index — waiting on the
    // whole-vault walk would stall an open for no answer it needs.
    this.#assertLoaded();
    const result = await this.#workspace.openNote(notelet.path as VaultPath, options?.openMode ?? "active");
    if (result.isErr()) throw new ApiError("open-failed", result.error.message, notelet.journal);
  }

  async journalOf(file: { path: string }): Promise<ExistingJournalNote | null> {
    await this.#readyForNotes();
    const entry = this.#index.entryByPath(file.path as VaultPath).flatMap(periodEntryOf);
    if (entry.isNone()) return null;
    const note = this.#noteAtAnchor(entry.value.journalName, entry.value.anchor);
    if (note === null) return null;
    // We were handed the file; re-resolving entry.path would add a null branch that
    // conflates "not a journal note" with a resolution hiccup.
    return { ...note, path: entry.value.path, file: file as ExistingJournalNote["file"] };
  }

  async noteletOf(file: { path: string }): Promise<NoteletNote | null> {
    await this.#readyForNotes();
    const entry = this.#index.entryByPath(file.path as VaultPath);
    if (entry.isNone() || !isNotelet(entry.value)) return null;
    // We were handed the file, so it stands in for a resolve that could only fail spuriously —
    // the same reason journalOf reuses it.
    return this.#noteletFrom(entry.value, file as NoteletNote["file"]);
  }

  async noteletsFor(
    selector: JournalSelector,
    date: DateInput,
    options?: { readonly type?: string },
  ): Promise<readonly NoteletNote[]> {
    await this.#readyForNotes();
    const calendarDate = this.#date(date);
    // A journal that cannot place this date is omitted rather than failing the fan-out, matching
    // notesFor.
    return this.#select(selector).flatMap((name) => {
      const anchor = this.#cycle.anchorOf(name, calendarDate);
      if (anchor.isNone()) return [];
      const listing = buildNoteletListing(
        { journals: this.#journals, index: this.#index, cycle: this.#cycle },
        { kind: "period", journalName: name, anchor: anchor.value },
      );
      return (
        listing.periods
          .flatMap((period) => period.types)
          // Filtered by stored name, not by resolved id: a type deleted in "keep" mode leaves its
          // notes carrying a name the config no longer holds, and the name is what a caller has.
          .filter((group) => options?.type === undefined || group.typeName === options.type)
          .flatMap((group) => group.notelets)
          .flatMap((entry) => {
            const file = this.#files.resolve(entry.path);
            if (file === null) return [];
            const note = this.#noteletFrom(entry, file);
            return note === null ? [] : [note];
          })
      );
    });
  }

  on<K extends keyof JournalsApiEvents>(event: K, handler: JournalsApiEvents[K]): () => void {
    // Widened off the generic: matching on `K` leaves ts-pattern excluding arms it has not
    // seen, so exhaustiveness stops type-checking after the third one.
    const name: keyof JournalsApiEvents = event;
    return match(name)
      .with("journalCreated", () =>
        this.#journalEvents.on("created", (name) => {
          (handler as JournalsApiEvents["journalCreated"])({ journal: name });
        }),
      )
      .with("journalDeleted", () =>
        this.#journalEvents.on("deleted", (name) => {
          (handler as JournalsApiEvents["journalDeleted"])({ journal: name });
        }),
      )
      .with("journalRenamed", () =>
        this.#journalEvents.on("renamed", (from, to) => {
          (handler as JournalsApiEvents["journalRenamed"])({ from, to });
        }),
      )
      .with("noteAdded", () =>
        this.#index.events.on("entryChanged", ({ entry, kind }) => {
          if (kind !== "added" || isNotelet(entry)) return;
          (handler as JournalsApiEvents["noteAdded"])({
            journal: entry.journalName,
            date: entry.anchor,
            path: entry.path,
          });
        }),
      )
      .with("noteRemoved", () =>
        this.#index.events.on("entryChanged", ({ entry, kind }) => {
          if (kind !== "removed" || isNotelet(entry)) return;
          (handler as JournalsApiEvents["noteRemoved"])({
            journal: entry.journalName,
            date: entry.anchor,
            path: entry.path,
          });
        }),
      )
      .with("noteletAdded", () =>
        this.#index.events.on("entryChanged", ({ entry, kind }) => {
          if (kind !== "added" || !isNotelet(entry)) return;
          (handler as JournalsApiEvents["noteletAdded"])({
            journal: entry.journalName,
            date: entry.anchor,
            type: entry.typeName,
            path: entry.path,
          });
        }),
      )
      .with("noteletRemoved", () =>
        this.#index.events.on("entryChanged", ({ entry, kind }) => {
          if (kind !== "removed" || !isNotelet(entry)) return;
          (handler as JournalsApiEvents["noteletRemoved"])({
            journal: entry.journalName,
            date: entry.anchor,
            type: entry.typeName,
            path: entry.path,
          });
        }),
      )
      .exhaustive();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    this.#rejectUnloaded?.(new ApiError("plugin-unloaded", "Journals has been unloaded"));
  }
}
