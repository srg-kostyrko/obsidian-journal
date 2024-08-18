import { type App, SuggestModal } from "obsidian";
import type { Journal } from "../contracts/journal.types";

export class JournalSuggestModal extends SuggestModal<Journal> {
  constructor(
    app: App,
    private journals: Journal[],
    private cb: (journal: Journal) => void,
  ) {
    super(app);
  }

  getSuggestions(query: string): Journal[] | Promise<Journal[]> {
    query = query.toLocaleLowerCase();
    return this.journals.filter((journal) => journal.name.toLocaleLowerCase().contains(query));
  }
  renderSuggestion(value: Journal, el: HTMLElement) {
    el.setText(value.name);
  }
  onChooseSuggestion(item: Journal) {
    this.cb(item);
  }
}
