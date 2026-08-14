import { AbstractInputSuggest } from "obsidian";

import { inject } from "@/infrastructure/di";

import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";
import { TrackedInstances } from "../../internal/tracked-instances";

import type { Disposer, InputSuggestDefinition } from "../types";

function closeInputSuggest(suggest: AbstractInputSuggest<unknown>): void {
  suggest.close();
}

export class InputSuggestService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #attached = new TrackedInstances<AbstractInputSuggest<unknown>>(this.#plugin, closeInputSuggest);

  attach<TResult>(element: HTMLInputElement, definition: InputSuggestDefinition<TResult>): Disposer {
    const attached = this.#attached;
    const suggester = new (class extends AbstractInputSuggest<TResult> {
      getSuggestions(query: string): TResult[] {
        return definition.fetch(query);
      }
      renderSuggestion(item: TResult, element: HTMLElement): void {
        const rendered = definition.render(item, element);
        if (typeof rendered === "string") element.setText(rendered);
      }
      selectSuggestion(item: TResult): void {
        element.value = definition.toValue(item);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        this.close();
        attached.delete(this);
      }
    })(this.#app, element);
    attached.add(suggester);
    return () => {
      suggester.close();
      attached.delete(suggester);
    };
  }
}
