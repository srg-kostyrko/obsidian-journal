import * as v from "valibot";
import { watch } from "vue";

import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NoteStructureService, NotesService, type VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { JournalsRepository } from "@/journals/repository";
import { SettingsService } from "@/settings";
import { admitsSubject, referencedProperties } from "@/tasks/visibility-rule/rule";

import { TaskHostToken, type OwnedNote, type TaskItem, type TaskProvider } from "../../types";

import { CHECKBOX_PROVIDER_ID, extractItems, lineDatesOf, lineStampOf, type LineDates } from "./extract";
import { checkboxJournalRuleSchema, type CheckboxJournalRule } from "./rule-schema";
import { checkboxSlice } from "./slice";
import CheckboxJournalRow from "./ui/CheckboxJournalRow.vue";
import CheckboxSettingsRow from "./ui/CheckboxSettingsRow.vue";

// A rule the schema cannot parse must not take the note's items with it — falling back to the
// global rule alone (the same treatment as no journal rule at all) is safer than dropping the note.
function parseJournalRule(rule: unknown): CheckboxJournalRule | null {
  const parsed = v.safeParse(checkboxJournalRuleSchema, rule);
  return parsed.success ? parsed.output : null;
}

interface CachedLineDates {
  readonly lines: string;
  readonly dates: LineDates;
}

const NO_LINE_DATES: CachedLineDates = { lines: "", dates: new Map() };

export class CheckboxTaskProvider implements TaskProvider {
  readonly #host = inject(TaskHostToken);
  readonly #notes = inject(NotesService);
  readonly #structure = inject(NoteStructureService);
  readonly #journals = inject(JournalsIndex);
  readonly #repository = inject(JournalsRepository);
  readonly #metadata = inject(NoteMetadataService);
  readonly #settings = inject(SettingsService).getSlice(checkboxSlice);
  #referenced: readonly string[] = [];
  readonly #lineDates = new Map<VaultPath, CachedLineDates>();
  // Drawn from one counter rather than per path, so a path cleared by a delete and read again
  // cannot hand a stale in-flight read the number it was waiting for.
  readonly #generation = new Map<VaultPath, number>();
  #reads = 0;
  // Bumped by every walk start, every disable and dispose, so a walk that is no longer the latest
  // stops at its next note rather than racing the one that replaced it.
  #walks = 0;
  readonly id = CHECKBOX_PROVIDER_ID;
  readonly settingsRow = CheckboxSettingsRow;
  readonly journalRow = CheckboxJournalRow;

  #referencedNow(): readonly string[] {
    const rules = this.#repository.find().map((journal) => journal.tasks.providers[CHECKBOX_PROVIDER_ID]?.dated);
    return [...referencedProperties(rules)].toSorted();
  }

  // Only the properties some journal's dated rule names: the whole frontmatter would make every
  // unrelated edit a changed item.
  #snapshot(path: VaultPath): Record<string, unknown> | undefined {
    if (this.#referenced.length === 0) return undefined;
    const properties = this.#metadata.get(path).getOrUndefined()?.properties ?? {};
    const picked: Record<string, unknown> = {};
    for (const name of this.#referenced) {
      const value = properties[name];
      if (Object.hasOwn(properties, name) && value !== undefined) picked[name] = structuredClone(value);
    }
    return picked;
  }

  #ownerOf(path: VaultPath): OwnedNote | undefined {
    return this.#host.ownerOf(path, this.id).getOrUndefined();
  }

  #refreshPath(path: VaultPath): void {
    this.#publish(path, this.#ownerOf(path));
    if (this.#lineDates.has(path)) return;
    const structure = this.#structure.get(path);
    if (structure.isSome() && structure.value.listItems.length > 0) void this.#readDates(path);
  }

  #refreshJournal(journalName: string): void {
    for (const note of this.#host.ownedNotes(this.id, journalName)) this.#publish(note.path, note);
  }

  #publish(path: VaultPath, owner: OwnedNote | undefined): void {
    this.#host.publish(this.id, { path }, this.#itemsFor(path, owner));
  }

  #itemsFor(path: VaultPath, owner: OwnedNote | undefined): readonly TaskItem[] {
    if (!this.#settings.state.enabled) return [];
    if (owner === undefined && this.#notes.isUserIgnored(path)) return [];
    const structure = this.#structure.get(path);
    if (structure.isNone()) return [];
    const cached = this.#lineDates.get(path);
    // Dates come only from this provider's own read, never from hydration: the index hydrates
    // from the same lines, and a second parse there could disagree with the relation the item was
    // indexed under.
    // Dates are keyed by line, so once the task lines have moved a cached entry would hang them on
    // whichever item now sits there; until the re-read lands the note fills undated instead.
    const lineDates = cached?.lines === lineStampOf(structure.value) ? cached.dates : undefined;
    return extractItems({
      path,
      structure: structure.value,
      vault: this.#settings.state.rule,
      journal: owner === undefined ? null : parseJournalRule(owner.rule),
      statusMap: this.#settings.state.statusMap,
      rolledMarker: this.#settings.state.rolledMarker,
      owned: owner !== undefined,
      lineDates,
      properties: lineDates === undefined || lineDates.size === 0 ? undefined : this.#snapshot(path),
    });
  }

  // Nothing is read before the index is ready: the first index, a reindex and a sync catch-up each
  // change every note at once, and the walk that readiness starts reads them one at a time.
  async #readDates(path: VaultPath): Promise<void> {
    if (!this.#journals.isReady()) return;
    if (await this.#load(path)) this.#publish(path, this.#ownerOf(path));
  }

  // Answers whether the entry it settled on still stands — false when a newer read overtook it or
  // the provider was off — so the caller publishes only what is current.
  async #load(path: VaultPath): Promise<boolean> {
    const generation = ++this.#reads;
    this.#generation.set(path, generation);
    if (!this.#settings.state.enabled) {
      this.#lineDates.delete(path);
      return false;
    }
    const before = this.#structure.get(path);
    if (before.isNone() || before.value.listItems.length === 0) {
      this.#lineDates.set(path, NO_LINE_DATES);
      return true;
    }
    if (this.#ownerOf(path) === undefined && this.#notes.isUserIgnored(path)) {
      this.#lineDates.delete(path);
      return true;
    }
    const read = await this.#notes.readCached(path);
    if (this.#generation.get(path) !== generation) return false;
    const structure = this.#structure.get(path);
    if (read.isErr() || structure.isNone()) this.#lineDates.delete(path);
    else {
      this.#lineDates.set(path, {
        lines: lineStampOf(structure.value),
        dates: lineDatesOf(read.value, structure.value),
      });
    }
    return true;
  }

  // Sequential and silent: one note read at a time, and a single "all" publish at the end rather
  // than one per note. Owned notes are read too — fill no longer dates them any other way. Cached
  // notes are skipped, so a walk after the first reads only what the cache never held — a note taken
  // out of Excluded files, or an excluded one a journal has since taken over — and publishes nothing
  // when it read nothing.
  async #walk(): Promise<void> {
    const run = ++this.#walks;
    if (!this.#settings.state.enabled) return;
    let read = false;
    for (const path of this.#notes.allMarkdownNotes()) {
      if (run !== this.#walks) return;
      if (this.#lineDates.has(path)) continue;
      const structure = this.#structure.get(path);
      if (structure.isNone() || structure.value.listItems.length === 0) continue;
      if (this.#ownerOf(path) === undefined && this.#notes.isUserIgnored(path)) continue;
      read = true;
      await this.#load(path);
    }
    if (run === this.#walks && read) this.#refillAll();
  }

  // Obsidian announces no change to Excluded files, so a settings change or a full refill is when
  // the walk looks again.
  #rewalk(): void {
    if (this.#journals.isReady()) void this.#walk();
  }

  #stopReading(): void {
    this.#walks++;
    // An empty generation map discards every read still in flight.
    this.#generation.clear();
    this.#lineDates.clear();
  }

  #forget(path: VaultPath): void {
    this.#lineDates.delete(path);
    this.#generation.delete(path);
    this.#host.publish(this.id, { path }, []);
  }

  // One "all" publish rather than one per note: the index replaces this provider's whole store in
  // a single version bump, where N publishes bump it N times and every consumer recomputes on each.
  // Notes no journal owns ride along from the cache, or a full refill would erase their dated items.
  #refillAll(): void {
    const items: TaskItem[] = [];
    const owned = new Set<VaultPath>();
    for (const note of this.#host.ownedNotes(this.id)) {
      owned.add(note.path);
      items.push(...this.#itemsFor(note.path, note));
    }
    for (const path of this.#lineDates.keys()) {
      if (owned.has(path)) continue;
      items.push(...this.#itemsFor(path, undefined));
    }
    this.#host.publish(this.id, "all", items);
  }

  // Gates the date relation only: a journal reaches its own notes' lines by containment first, and
  // the listing never asks about those.
  admits(item: TaskItem, journalName: string): boolean {
    if (item.facts === undefined) return true;
    const rule = this.#repository.get(journalName).getOrUndefined()?.tasks.providers[this.id]?.dated;
    return admitsSubject(rule, { path: item.path, tags: item.facts.tags, properties: item.facts.properties });
  }

  start(): () => void {
    let disposed = false;
    this.#referenced = this.#referencedNow();
    this.#refillAll();
    // The registry starts before layout-ready, when the file list is partial and notes restored from
    // cached metadata emit no metadata-changed; index readiness is the signal that the walk is complete.
    if (this.#journals.isReady()) void this.#walk();
    else {
      void this.#journals.whenReady().then(() => {
        if (!disposed) void this.#walk();
      });
    }
    // enabled, rule, statusMap and rolledMarker feed #itemsFor, so a settings-dashboard edit to any of them must
    // take effect rather than sit stale until an unrelated note or journal event happens to fire a
    // refresh. (`canonical` names the symbol a write emits and is read by nothing here, but it sits
    // in the same slice and a deep watch cannot tell the fields apart.) Deep because the fields it
    // must catch are nested one level into the slice, not on the slice object itself.
    const stopSettingsWatch = watch(
      () => this.#settings.state,
      () => {
        // Reads that land while off would be stale by the time it is back on, so the cache goes
        // with the switch and switching on walks the vault afresh.
        if (!this.#settings.state.enabled) this.#stopReading();
        this.#refillAll();
        this.#rewalk();
      },
      { deep: true },
    );
    // Items snapshot only the properties some journal's dated rule names, so a rule naming a new
    // one leaves every dated line without it until the refill.
    const stopRulesWatch = watch(
      () => this.#referencedNow(),
      (names, previous) => {
        if (names.length === previous.length && names.every((name, at) => name === previous[at])) return;
        this.#referenced = names;
        this.#refillAll();
      },
    );
    const stopOwnedNotesWatch = this.#host.onOwnedNotesChanged((change) => {
      // A single note refills at once — it is one structure read, and a decoration repaints off it.
      if (change.kind === "note") this.#refreshPath(change.path);
      else if (change.kind === "all") {
        this.#refillAll();
        this.#rewalk();
      } else this.#refreshJournal(change.journalName);
    });
    // Every path, owned or not: the owned-note change above repaints structure at once, and the
    // read here is what brings the dates after it.
    const stopNoteWatches = [
      this.#notes.events.on("metadata-changed", (path) => {
        void this.#readDates(path);
      }),
      this.#notes.events.on("renamed", ({ from, to }) => {
        this.#forget(from);
        void this.#readDates(to);
      }),
      this.#notes.events.on("deleted", (path) => {
        this.#forget(path);
      }),
    ];
    return () => {
      stopSettingsWatch();
      stopRulesWatch();
      stopOwnedNotesWatch();
      disposed = true;
      for (const stop of stopNoteWatches) stop();
      this.#stopReading();
    };
  }
}
