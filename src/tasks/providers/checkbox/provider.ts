import * as v from "valibot";
import { watch } from "vue";

import { inject } from "@/infrastructure/di";
import { NoteStructureService, type VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { TaskHostToken, type OwnedNote, type TaskItem, type TaskProvider } from "../../types";

import { datesIn } from "./dates";
import { CHECKBOX_PROVIDER_ID, extractItems } from "./extract";
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

// Both the vault-wide rule editor and a journal's own bind their text inputs straight to the
// stored value with no `.lazy`, so typing one tag name writes the slice — or the journal config —
// once per character. A refill walks owned notes, re-reads each structure and re-extracts, so
// without this the cost of a keystroke is the whole owned set.
export const REFILL_DEBOUNCE_MS = 200;

export class CheckboxTaskProvider implements TaskProvider {
  readonly #host = inject(TaskHostToken);
  readonly #structure = inject(NoteStructureService);
  readonly #settings = inject(SettingsService).getSlice(checkboxSlice);
  readonly #pendingJournals = new Set<string>();
  #pendingAll = false;
  // `number` rather than a ReturnType of setTimeout: Express's type dependencies pull Node's
  // ambient timer overloads into every file, and this one has to stay the browser's.
  #refillTimer: number | undefined;
  readonly id = CHECKBOX_PROVIDER_ID;
  readonly settingsRow = CheckboxSettingsRow;
  readonly journalRow = CheckboxJournalRow;

  #refreshPath(path: VaultPath): void {
    const note = this.#host.ownerOf(path, this.id);
    if (note.isSome()) this.#publishFor(note.value);
    else this.#host.publish(this.id, { path }, []);
  }

  #refreshJournal(journalName: string): void {
    for (const note of this.#host.ownedNotes(this.id, journalName)) this.#publishFor(note);
  }

  // Coalesces every refill wider than one note. A pending full refill subsumes any journal queued
  // beside it, so the flush never does both.
  #scheduleRefill(scope: "all" | { journalName: string }): void {
    if (scope === "all") this.#pendingAll = true;
    else this.#pendingJournals.add(scope.journalName);
    if (this.#refillTimer !== undefined) window.clearTimeout(this.#refillTimer);
    this.#refillTimer = window.setTimeout(() => {
      this.#refillTimer = undefined;
      const journals = [...this.#pendingJournals];
      const all = this.#pendingAll;
      this.#pendingAll = false;
      this.#pendingJournals.clear();
      if (all) this.#refillAll();
      else for (const journalName of journals) this.#refreshJournal(journalName);
    }, REFILL_DEBOUNCE_MS);
  }

  #publishFor(note: OwnedNote): void {
    this.#host.publish(this.id, { path: note.path }, this.#itemsFor(note));
  }

  #itemsFor(note: OwnedNote): readonly TaskItem[] {
    if (!this.#settings.state.enabled) return [];
    const structure = this.#structure.get(note.path);
    if (structure.isNone()) return [];
    return extractItems({
      path: note.path,
      structure: structure.value,
      vault: this.#settings.state.rule,
      journal: parseJournalRule(note.rule),
      statusMap: this.#settings.state.statusMap,
    });
  }

  // One "all" publish rather than one per note: the index replaces this provider's whole store in
  // a single version bump, where N publishes bump it N times and every consumer recomputes on each.
  #refillAll(): void {
    const items: TaskItem[] = [];
    for (const note of this.#host.ownedNotes(this.id)) items.push(...this.#itemsFor(note));
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
      () => this.#scheduleRefill("all"),
      { deep: true },
    );
    const stopOwnedNotesWatch = this.#host.onOwnedNotesChanged((change) => {
      // A single note refills at once — it is one structure read, and a decoration repaints off it.
      if (change.kind === "note") this.#refreshPath(change.path);
      else if (change.kind === "all") this.#scheduleRefill("all");
      else this.#scheduleRefill({ journalName: change.journalName });
    });
    return () => {
      stopSettingsWatch();
      stopOwnedNotesWatch();
      if (this.#refillTimer !== undefined) window.clearTimeout(this.#refillTimer);
      this.#refillTimer = undefined;
    };
  }

  // TaskIndex.hydrate calls this once a line item's markdown exists — extraction alone cannot read
  // it, since metadataCache carries no line text. Dates and retargetable are a dialect only this
  // provider knows; the index's own fallback (markdown alone, dates untouched) is what every other
  // provider that skips this method gets.
  hydrateItem(item: TaskItem, markdown: string): TaskItem {
    if (item.display.kind !== "line") return item;
    const dates = datesIn(markdown);
    return {
      ...item,
      dates,
      capabilities: { ...item.capabilities, retargetable: Object.keys(dates).length > 0 },
      display: { ...item.display, markdown },
    };
  }
}
