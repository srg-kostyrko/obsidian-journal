import type { CalendarDate, AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { NoteFileService } from "@/infrastructure/host/internal/note-file-service";
import { CycleService } from "@/journals/cycle";
import { FrontmatterService } from "@/journals/frontmatter";
import { JournalsIndex } from "@/journals/journals-index";
import { NotePathService } from "@/journals/notes/note-path";
import { JournalsRepository } from "@/journals/repository";
import { TimelineService } from "@/journals/timeline";
import { ShelvesService } from "@/shelves/service";

import { normalizeSelector, toCalendarDate, toJournalInfo } from "./convert";
import { ApiError } from "./errors";

import type { DateInput, ExistingJournalNote, JournalInfo, JournalNote, JournalSelector } from "./public-api";

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
