import { AbstractInputSuggest, type App, TFile, TFolder } from "obsidian";

export class TemplateSuggest extends AbstractInputSuggest<TFile> {
  constructor(
    app: App,
    protected textInputElement: HTMLInputElement,
  ) {
    super(app, textInputElement);
  }

  getSuggestions(input: string): TFile[] {
    const search = input.toLocaleLowerCase();
    if (!search) return [];
    const fileAndFolders = this.app.vault.getAllLoadedFiles();
    return fileAndFolders.filter((f): f is TFile => {
      if (f instanceof TFolder) return false;
      const path = f.path.toLocaleLowerCase();
      return path.includes(search);
    });
  }
  renderSuggestion(value: TFile, element: HTMLElement): void {
    element.setText(value.path);
  }
  selectSuggestion(value: TFile): void {
    this.textInputElement.value = value.path;
    this.textInputElement.trigger("input");
    this.close();
  }
}
