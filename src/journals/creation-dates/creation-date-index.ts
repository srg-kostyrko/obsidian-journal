import { createNanoEvents } from "nanoevents";
import { watch, type WatchStopHandle } from "vue";

import { CalendarDate, type AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { NoteMetadataService, NotesService, type Note, type VaultPath } from "@/infrastructure/host";
import { SettingsEventsToken, SettingsService } from "@/settings";

import { JournalsIndex } from "../journals-index";
import { isNotelet } from "../types";

import { resolveCreationDate } from "./creation-date";
import { dayNotesSlice } from "./slice";

interface CreationDateEvents {
  changed: () => void;
}

export interface CreatedNote {
  readonly note: Note;
  readonly created: CalendarDate;
}

/** Which notes were created on each day, vault-wide. */
export class CreationDateIndex {
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #index = inject(JournalsIndex);
  readonly #settingsEvents = inject(SettingsEventsToken);
  readonly #slice = inject(SettingsService).getSlice(dayNotesSlice);
  readonly #emitter: TypedEmitter<CreationDateEvents> = createNanoEvents();
  readonly #unsubscribes: (() => void)[] = [];

  readonly #byDay = new Map<AnchorString, Set<VaultPath>>();
  readonly #dayOf = new Map<VaultPath, AnchorString>();
  #stopSliceWatch: WatchStopHandle | undefined;
  #ready = false;
  #changeScheduled = false;
  #disposed = false;

  readonly events: Subscribable<CreationDateEvents> = this.#emitter;

  #date(path: VaultPath): void {
    const note = this.#notes.find(path);
    const created = note.isSome()
      ? resolveCreationDate(note.value, this.#metadata.get(path).getOrUndefined(), this.#slice.state)
      : null;
    const next = created?.toAnchor();
    const previous = this.#dayOf.get(path);
    if (next === previous) return;
    if (previous !== undefined) {
      const paths = this.#byDay.get(previous);
      paths?.delete(path);
      if (paths?.size === 0) this.#byDay.delete(previous);
    }
    if (next === undefined) {
      this.#dayOf.delete(path);
    } else {
      this.#dayOf.set(path, next);
      let paths = this.#byDay.get(next);
      if (paths === undefined) {
        paths = new Set();
        this.#byDay.set(next, paths);
      }
      paths.add(path);
    }
    this.#scheduleChanged();
  }

  #drop(path: VaultPath): void {
    const previous = this.#dayOf.get(path);
    if (previous === undefined) return;
    this.#dayOf.delete(path);
    const paths = this.#byDay.get(previous);
    paths?.delete(path);
    if (paths?.size === 0) this.#byDay.delete(previous);
    this.#scheduleChanged();
  }

  #rebuild(): void {
    const present = new Set(this.#notes.allMarkdownNotes());
    for (const known of this.#dayOf.keys()) if (!present.has(known)) this.#drop(known);
    for (const path of present) this.#date(path);
  }

  #scheduleChanged(): void {
    if (!this.#ready || this.#changeScheduled) return;
    this.#changeScheduled = true;
    queueMicrotask(() => {
      this.#changeScheduled = false;
      if (!this.#disposed) this.#emitter.emit("changed");
    });
  }

  #pathsBetween(start: CalendarDate, end: CalendarDate): VaultPath[] {
    const out: VaultPath[] = [];
    if (!this.#ready) return out;
    for (let day = start; !day.isAfter(end); day = day.shift(1, "d")) {
      const paths = this.#byDay.get(day.toAnchor());
      if (paths !== undefined) out.push(...paths);
    }
    return out;
  }

  // Waits on the journals index because its readiness already covers both the file list and
  // every note resolving in the metadata cache; dating earlier would fall back to ctime for
  // every note whose frontmatter has not been parsed yet.
  async initialize(): Promise<void> {
    await this.#index.whenReady();
    if (this.#disposed) return;
    this.#rebuild();
    this.#unsubscribes.push(
      this.#notes.events.on("created", (note) => this.#date(note.path)),
      this.#notes.events.on("deleted", (path) => this.#drop(path)),
      this.#notes.events.on("renamed", ({ from, to }) => {
        this.#drop(from);
        this.#date(to);
      }),
      this.#notes.events.on("metadata-changed", (path) => this.#date(path)),
      this.#settingsEvents.on("reloaded", () => this.#rebuild()),
    );
    this.#stopSliceWatch = watch(
      () => [this.#slice.state.property, this.#slice.state.format],
      () => this.#rebuild(),
    );
    this.#ready = true;
    this.#scheduleChanged();
  }

  isReady(): boolean {
    return this.#ready;
  }

  between(start: CalendarDate, end: CalendarDate): readonly CreatedNote[] {
    const out: CreatedNote[] = [];
    for (const path of this.#pathsBetween(start, end)) {
      const day = this.#dayOf.get(path);
      const note = this.#notes.find(path);
      // Looked up at query time so the note's file times are current, not those seen when dated.
      if (day !== undefined && note.isSome()) out.push({ note: note.value, created: CalendarDate.fromAnchor(day) });
    }
    return out;
  }

  // Period-ness is read here rather than indexed, so a note connecting to or leaving a journal
  // needs no event of this index's own.
  countBetween(start: CalendarDate, end: CalendarDate, options: { excludePeriodNotes: boolean }): number {
    let count = 0;
    for (const path of this.#pathsBetween(start, end)) {
      if (options.excludePeriodNotes) {
        const entry = this.#index.entryByPath(path);
        if (entry.isSome() && !isNotelet(entry.value)) continue;
      }
      count++;
    }
    return count;
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
    this.#stopSliceWatch?.();
  }
}
