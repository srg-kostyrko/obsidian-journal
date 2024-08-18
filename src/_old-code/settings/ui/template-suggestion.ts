import { AbstractInputSuggest, type App, TFile, TFolder } from "obsidian";

export class TemplateSuggestion extends AbstractInputSuggest<TFile> {
  constructor(
    app: App,
    protected textInputEl: HTMLInputElement,
  ) {
    super(app, textInputEl);
  }

  getSuggestions(inputStr: string): TFile[] {
    const search = inputStr.toLocaleLowerCase();
    if (!search) return [];
    const fileAndFolders = this.app.vault.getAllLoadedFiles();
    return fileAndFolders.filter((f): f is TFile => {
      if (f instanceof TFolder) return false;
      const path = f.path.toLocaleLowerCase();
      return path.includes(search);
    });
  }
  renderSuggestion(value: TFile, el: HTMLElement): void {
    el.setText(value.path);
  }
  selectSuggestion(value: TFile): void {
    this.textInputEl.value = value.path;
    this.textInputEl.trigger("input");
    this.close();
  }
}
