import { AbstractInputSuggest, TFolder } from "obsidian";
import { app$ } from "../../stores/obsidian.store";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(protected textInputEl: HTMLInputElement) {
    super(app$.value, textInputEl);
  }

  getSuggestions(inputStr: string): TFolder[] {
    const fileAndFolders = this.app.vault.getAllLoadedFiles();
    const search = inputStr.toLocaleLowerCase();
    return fileAndFolders.filter((f): f is TFolder => {
      if (!(f instanceof TFolder)) return false;
      const path = f.path.toLocaleLowerCase();
      if (path === "/") return false;
      return path.includes(search);
    });
  }
  renderSuggestion(value: TFolder, el: HTMLElement): void {
    el.setText(value.path);
  }
  selectSuggestion(value: TFolder): void {
    this.textInputEl.value = value.path;
    this.textInputEl.trigger("input");
    this.close();
  }
}
