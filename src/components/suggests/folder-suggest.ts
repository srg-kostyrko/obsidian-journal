import { AbstractInputSuggest, type App, TFolder } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(
    app: App,
    protected textInputElement: HTMLInputElement,
  ) {
    super(app, textInputElement);
  }

  getSuggestions(input: string): TFolder[] {
    const fileAndFolders = this.app.vault.getAllLoadedFiles();
    const search = input.toLocaleLowerCase();
    return fileAndFolders.filter((f): f is TFolder => {
      if (!(f instanceof TFolder)) return false;
      const path = f.path.toLocaleLowerCase();
      if (path === "/") return false;
      return path.includes(search);
    });
  }
  renderSuggestion(value: TFolder, element: HTMLElement): void {
    element.setText(value.path);
  }
  selectSuggestion(value: TFolder): void {
    this.textInputElement.value = value.path;
    this.textInputElement.trigger("input");
    this.close();
  }
}
