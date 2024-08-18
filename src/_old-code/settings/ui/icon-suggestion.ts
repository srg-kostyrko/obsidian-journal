import { AbstractInputSuggest, type App, getIcon, getIconIds } from "obsidian";

export class IconSuggestion extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    protected textInputEl: HTMLInputElement,
  ) {
    super(app, textInputEl);
  }

  getSuggestions(inputStr: string): string[] {
    const icons = getIconIds();
    const search = inputStr.toLocaleLowerCase();
    return icons
      .filter((icon) => {
        return icon.toLocaleLowerCase().includes(search);
      })
      .sort();
  }
  renderSuggestion(value: string, el: HTMLElement): void {
    const icon = getIcon(value);
    if (icon) {
      icon.classList.add("suggestion-icon");
      el.classList.add("mod-complex");
      el.classList.add("journal-suggestion-icon");
      el.appendChild(icon);
      const name = el.createSpan();
      name.classList.add("journal-suggestion-name");
      name.style.marginLeft = "8px";
      name.appendText(value);
    }
  }
  selectSuggestion(value: string): void {
    this.textInputEl.value = value;
    this.textInputEl.trigger("input");
    this.close();
  }
}
