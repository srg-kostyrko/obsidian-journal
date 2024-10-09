import { AbstractInputSuggest, getIcon, getIconIds } from "obsidian";
import { app$ } from "../../stores/obsidian.store";

export class IconSuggest extends AbstractInputSuggest<string> {
  constructor(protected textInputElement: HTMLInputElement) {
    super(app$.value, textInputElement);
  }

  getSuggestions(input: string): string[] {
    const icons = getIconIds();
    const search = input.toLocaleLowerCase();
    return icons
      .filter((icon) => {
        return icon.toLocaleLowerCase().includes(search);
      })
      .sort();
  }
  renderSuggestion(value: string, element: HTMLElement): void {
    const icon = getIcon(value);
    if (icon) {
      icon.classList.add("suggestion-icon");
      element.classList.add("mod-complex");
      element.classList.add("journal-suggestion-icon");
      element.append(icon);
      const name = element.createSpan();
      name.classList.add("journal-suggestion-name");
      name.style.marginLeft = "8px";
      name.appendText(value);
    }
  }
  selectSuggestion(value: string): void {
    this.textInputElement.value = value;
    this.textInputElement.trigger("input");
    this.close();
  }
}
