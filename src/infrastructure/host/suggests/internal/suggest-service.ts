import { SuggestModal } from "obsidian";

import { inject } from "@/infrastructure/di";
import { AsyncResult } from "@/infrastructure/result";

import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";
import { TrackedInstances } from "../../internal/tracked-instances";
import { SuggestCancelled } from "../errors";

import type { SuggestDefinition } from "../types";

function closeSuggestModal(modal: SuggestModal<unknown>): void {
  modal.close();
}

export class SuggestService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #open = new TrackedInstances<SuggestModal<unknown>>(this.#plugin, closeSuggestModal);

  open<TInput, TResult>(
    definition: SuggestDefinition<TInput, TResult>,
    input: TInput,
  ): AsyncResult<TResult, SuggestCancelled> {
    return AsyncResult.fromPromise(
      new Promise<TResult>((resolve, reject) => {
        const openSet = this.#open;
        const modal = new (class extends SuggestModal<TResult> {
          #picked = false;
          getSuggestions(query: string): TResult[] | Promise<TResult[]> {
            return definition.fetch(query, input);
          }
          renderSuggestion(item: TResult, element: HTMLElement): void {
            const rendered = definition.render(item, element);
            if (typeof rendered === "string") element.setText(rendered);
          }
          onChooseSuggestion(item: TResult): void {
            this.#picked = true;
            resolve(item);
          }
          onClose(): void {
            openSet.delete(this);
            // Obsidian can invoke onClose before onChooseSuggestion when a suggestion is chosen by
            // mouse (observed on 1.12.x), so deciding "cancelled" synchronously here mis-reports a
            // real choice. Defer the verdict a microtask to let onChooseSuggestion set #picked first.
            queueMicrotask(() => {
              if (!this.#picked) reject(new SuggestCancelled());
            });
          }
        })(this.#app);
        if (definition.placeholder) modal.setPlaceholder(definition.placeholder(input));
        openSet.add(modal);
        modal.open();
      }),
      (cause) => (cause instanceof SuggestCancelled ? cause : new SuggestCancelled()),
    );
  }
}
