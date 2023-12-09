import { AbstractInputSuggest, App, TFolder } from "obsidian";

export class FolderSuggestion extends AbstractInputSuggest<TFolder> {
  constructor(
    app: App,
    protected textInputEl: HTMLInputElement,
    public root?: string,
  ) {
    super(app, textInputEl);
  }

  getSuggestions(inputStr: string): TFolder[] {
    const fileAndFolders = this.app.vault.getAllLoadedFiles();
    const search = inputStr.toLocaleLowerCase();
    const root = this.root?.toLocaleLowerCase();
    return fileAndFolders.filter((f): f is TFolder => {
      if (!(f instanceof TFolder)) return false;
      let path = f.path.toLocaleLowerCase();
      if (path === "/") return false;
      if (root) {
        if (!path.startsWith(root)) return false;
        path = path.slice(root.length);
      }
      return path.includes(search);
    });
  }
  renderSuggestion(value: TFolder, el: HTMLElement): void {
    el.setText(this.extractFolderPath(value));
  }
  selectSuggestion(value: TFolder): void {
    this.textInputEl.value = this.extractFolderPath(value);
    this.textInputEl.trigger("input");
    this.close();
  }

  private extractFolderPath(folder: TFolder): string {
    const path = folder.path;
    if (this.root) return path.slice(this.root.length + 1);
    return path;
  }
}
