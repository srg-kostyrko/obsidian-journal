import { InvariantError } from "@/infrastructure/result";

import type { InputSuggestService } from "./internal/input-suggest-service";
import type { InputSuggestDefinition } from "./types";

export interface FakeInputSuggestHandle<TResult> {
  readonly element: HTMLInputElement;
  readonly definition: InputSuggestDefinition<TResult>;
  query(q: string): TResult[];
  select(item: TResult): void;
  readonly isAttached: boolean;
}

export class FakeInputSuggestService implements Pick<InputSuggestService, "attach"> {
  readonly #handles: FakeInputSuggestHandle<unknown>[] = [];

  get attachments(): readonly FakeInputSuggestHandle<unknown>[] {
    return this.#handles;
  }

  attach<TResult>(element: HTMLInputElement, definition: InputSuggestDefinition<TResult>): () => void {
    let attached = true;
    const handle: FakeInputSuggestHandle<TResult> = {
      element,
      definition,
      query: (q) => definition.fetch(q),
      select: (item) => {
        if (!attached) return;
        element.value = definition.toValue(item);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      },
      get isAttached() {
        return attached;
      },
    };
    this.#handles.push(handle);
    return () => {
      attached = false;
    };
  }

  handleFor<TResult = unknown>(element: HTMLInputElement): FakeInputSuggestHandle<TResult> {
    const handle = this.#handles.find((h) => h.element === element);
    if (!handle) {
      throw new InvariantError("FakeInputSuggestService.handleFor() called for an unattached element");
    }
    return handle as unknown as FakeInputSuggestHandle<TResult>;
  }
}
