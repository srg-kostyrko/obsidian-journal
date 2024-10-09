import { AbstractInputSuggest, TFolder } from "obsidian";
import { app$ } from "../../stores/obsidian.store";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(protected textInputElement: HTMLInputElement) {
    super(app$.value, textInputElement);
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
