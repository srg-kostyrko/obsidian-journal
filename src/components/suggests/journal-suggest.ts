import { type App, SuggestModal } from "obsidian";

export class JournalSuggestModal extends SuggestModal<string> {
  constructor(
    app: App,
    private journals: string[],
    private cb: (journalId: string) => void,
  ) {
    super(app);
  }

  getSuggestions(query: string): string[] | Promise<string[]> {
    query = query.toLocaleLowerCase();
    return this.journals.filter((journal) => journal.toLocaleLowerCase().contains(query));
  }
  renderSuggestion(value: string, el: HTMLElement) {
    el.setText(value);
  }
  onChooseSuggestion(item: string) {
    this.cb(item);
  }
}
