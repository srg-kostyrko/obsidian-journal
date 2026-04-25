import { type App, SuggestModal } from "obsidian";

const ALL = "All journals";

export class ShelfSuggestModal extends SuggestModal<string> {
  constructor(
    app: App,
    private shelves: string[],
    private callback: (shelfName: string | null) => void,
  ) {
    super(app);
  }

  getSuggestions(query: string): string[] | Promise<string[]> {
    query = query.toLocaleLowerCase();
    return ["All journals", ...this.shelves.filter((shelf) => shelf.toLocaleLowerCase().contains(query))];
  }
  renderSuggestion(value: string, element: HTMLElement) {
    element.setText(value);
  }
  onChooseSuggestion(item: string) {
    this.callback(item === ALL ? null : item);
  }
}
