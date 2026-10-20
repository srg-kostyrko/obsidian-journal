import * as v from "valibot";
import { watch } from "vue";

import { inject } from "@/infrastructure/di";
import { NoteStructureService, NotesService, type VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

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
  readonly #settings = inject(SettingsService).getSlice(checkboxSlice);
  readonly #lineDates = new Map<VaultPath, CachedLineDates>();
  // Drawn from one counter rather than per path, so a path cleared by a delete and read again
  // cannot hand a stale in-flight read the number it was waiting for.
  readonly #generation = new Map<VaultPath, number>();
  #reads = 0;
  readonly id = CHECKBOX_PROVIDER_ID;
  readonly settingsRow = CheckboxSettingsRow;
  readonly journalRow = CheckboxJournalRow;

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
    // Dates are keyed by line, so once the task lines have moved a cached entry would hang them on
    // whichever item now sits there; until the re-read lands the note fills undated instead.
    const lineDates = cached?.lines === lineStampOf(structure.value) ? cached.dates : undefined;
    return extractItems({
      path,
      structure: structure.value,
      vault: this.#settings.state.rule,
      journal: owner === undefined ? null : parseJournalRule(owner.rule),
      statusMap: this.#settings.state.statusMap,
      owned: owner !== undefined,
      lineDates,
    });
  }

  async #readDates(path: VaultPath): Promise<void> {
    const generation = ++this.#reads;
    this.#generation.set(path, generation);
    if (!this.#settings.state.enabled) {
      this.#lineDates.delete(path);
      return;
    }
    const owner = this.#ownerOf(path);
    const before = this.#structure.get(path);
    if (before.isNone() || before.value.listItems.length === 0) {
      this.#lineDates.set(path, NO_LINE_DATES);
      this.#publish(path, owner);
      return;
    }
    if (owner === undefined && this.#notes.isUserIgnored(path)) {
      this.#lineDates.delete(path);
      this.#host.publish(this.id, { path }, []);
      return;
    }
    const read = await this.#notes.readCached(path);
    if (this.#generation.get(path) !== generation) return;
    const structure = this.#structure.get(path);
    if (read.isErr() || structure.isNone()) this.#lineDates.delete(path);
    else {
      this.#lineDates.set(path, {
        lines: lineStampOf(structure.value),
        dates: lineDatesOf(read.value, structure.value),
      });
    }
    this.#publish(path, this.#ownerOf(path));
  }

  #forget(path: VaultPath): void {
    this.#lineDates.delete(path);
    this.#generation.delete(path);
    this.#host.publish(this.id, { path }, []);
  }

  // One "all" publish rather than one per note: the index replaces this provider's whole store in
  // a single version bump, where N publishes bump it N times and every consumer recomputes on each.
  #refillAll(): void {
    const items: TaskItem[] = [];
    for (const note of this.#host.ownedNotes(this.id)) items.push(...this.#itemsFor(note.path, note));
    this.#host.publish(this.id, "all", items);
  }

  start(): () => void {
    this.#refillAll();
    // enabled, rule and statusMap feed #itemsFor, so a settings-dashboard edit to any of them must
    // take effect rather than sit stale until an unrelated note or journal event happens to fire a
    // refresh. (`canonical` names the symbol a write emits and is read by nothing here, but it sits
    // in the same slice and a deep watch cannot tell the fields apart.) Deep because the fields it
    // must catch are nested one level into the slice, not on the slice object itself.
    const stopSettingsWatch = watch(
      () => this.#settings.state,
      () => this.#refillAll(),
      { deep: true },
    );
    const stopOwnedNotesWatch = this.#host.onOwnedNotesChanged((change) => {
      // A single note refills at once — it is one structure read, and a decoration repaints off it.
      if (change.kind === "note") this.#refreshPath(change.path);
      else if (change.kind === "all") this.#refillAll();
      else this.#refreshJournal(change.journalName);
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
      stopOwnedNotesWatch();
      for (const stop of stopNoteWatches) stop();
      // An empty generation map discards every read still in flight.
      this.#generation.clear();
      this.#lineDates.clear();
    };
  }

  // TaskIndex.hydrate calls this once a line item's markdown exists — metadataCache carries no line
  // text. Dates stay as fill set them: fill parsed the same lines, and a second parse here could
  // disagree with the relation the item was indexed under.
  hydrateItem(item: TaskItem, markdown: string): TaskItem {
    if (item.display.kind !== "line") return item;
    return { ...item, display: { ...item.display, markdown } };
  }
}
