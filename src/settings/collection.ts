import * as v from "valibot";
import { reactive } from "vue";

import type { SettingsNotice } from "./notices";
import type { CollectionDefinition } from "./schema";
import type { CollectionHandle } from "./types";
import type { BaseIssue, BaseSchema, InferOutput } from "valibot";

type AnySchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>;

export class ReactiveCollection<TItem extends AnySchema> implements CollectionHandle<InferOutput<TItem>> {
  readonly #definition: CollectionDefinition<string, TItem>;
  readonly #entries: Map<string, InferOutput<TItem>>;

  constructor(
    definition: CollectionDefinition<string, TItem>,
    raw: unknown,
    pushNotice: (notice: SettingsNotice) => void,
  ) {
    this.#definition = definition;
    this.#entries = reactive(new Map());
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [id, value] of Object.entries(raw)) {
        const parsed = v.safeParse(definition.itemSchema, value);
        if (parsed.success) {
          this.#entries.set(id, reactive(parsed.output as object));
        } else {
          this.#entries.set(id, reactive(definition.defaultItem(id) as object));
          pushNotice({
            kind: "slice-reset",
            sliceKey: `${definition.key}/${id}`,
            detail: parsed.issues.map((issue) => issue.message).join("; "),
          });
        }
      }
    }
  }

  get entries(): ReadonlyMap<string, InferOutput<TItem>> {
    return this.#entries;
  }

  add(id: string, init?: Partial<InferOutput<TItem>>): InferOutput<TItem> {
    const item = reactive({
      ...(this.#definition.defaultItem(id) as object),
      ...init,
    }) as InferOutput<TItem>;
    this.#entries.set(id, item);
    return item;
  }

  remove(id: string): void {
    this.#entries.delete(id);
  }

  get(id: string): InferOutput<TItem> | undefined {
    return this.#entries.get(id);
  }

  serialize(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [id, value] of this.#entries) {
      out[id] = JSON.parse(JSON.stringify(value));
    }
    return out;
  }
}
