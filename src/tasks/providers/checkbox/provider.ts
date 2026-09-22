import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { NoteStructureService, type VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { TaskHostToken, type OwnedNote, type TaskItem, type TaskProvider } from "../../types";

import { datesIn } from "./dates";
import { CHECKBOX_PROVIDER_ID, extractItems } from "./extract";
import { checkboxJournalRuleSchema, type CheckboxJournalRule } from "./rule-schema";
import { checkboxSlice } from "./slice";

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

  #refreshPath(path: VaultPath): void {
    const note = this.#host.ownerOf(path, this.id);
    if (note.isSome()) this.#publishFor(note.value);
    else this.#host.publish(this.id, { path }, []);
  }

  #refreshJournal(journalName: string): void {
    for (const note of this.#host.ownedNotes(this.id)) {
      if (note.journalName === journalName) this.#publishFor(note);
    }
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

  start(): () => void {
    for (const note of this.#host.ownedNotes(this.id)) this.#publishFor(note);
    return this.#host.onOwnedNotesChanged((change) => {
      if (change.kind === "note") this.#refreshPath(change.path);
      else this.#refreshJournal(change.journalName);
    });
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
