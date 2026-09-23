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

export class CheckboxTaskProvider implements TaskProvider {
  readonly #host = inject(TaskHostToken);
  readonly #structure = inject(NoteStructureService);
  readonly #settings = inject(SettingsService).getSlice(checkboxSlice);
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
      () => this.#refillAll(),
      { deep: true },
    );
    const stopOwnedNotesWatch = this.#host.onOwnedNotesChanged((change) => {
      // A single note refills at once — it is one structure read, and a decoration repaints off it.
      if (change.kind === "note") this.#refreshPath(change.path);
      else if (change.kind === "all") this.#refillAll();
      else this.#refreshJournal(change.journalName);
    });
    return () => {
      stopSettingsWatch();
      stopOwnedNotesWatch();
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
