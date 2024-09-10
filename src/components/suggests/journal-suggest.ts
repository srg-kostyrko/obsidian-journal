import { type App, SuggestModal } from "obsidian";

interface JournalOption {
  id: string;
  name: string;
}

export class JournalSuggestModal extends SuggestModal<JournalOption> {
  constructor(
    app: App,
    private journals: JournalOption[],
    private cb: (journalId: string) => void,
  ) {
    super(app);
  }

  getSuggestions(query: string): JournalOption[] | Promise<JournalOption[]> {
    query = query.toLocaleLowerCase();
    return this.journals.filter((journal) => journal.name.toLocaleLowerCase().contains(query));
  }
  renderSuggestion(value: JournalOption, el: HTMLElement) {
    el.setText(value.name);
  }
  onChooseSuggestion(item: JournalOption) {
    this.cb(item.id);
  }
}
