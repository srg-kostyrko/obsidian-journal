import * as v from "valibot";

import type { Logger } from "@/infrastructure/logger";

import type { CollectionDefinition } from "./schema";
import type { CollectionHandle } from "./types";
import type { BaseIssue, BaseSchema, InferOutput } from "valibot";

type AnySchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>;

export class ReactiveCollection<TItem extends AnySchema> implements CollectionHandle<InferOutput<TItem>> {
  readonly #definition: CollectionDefinition<string, TItem>;
  readonly #entries: Record<string, InferOutput<TItem>>;

  constructor(
    definition: CollectionDefinition<string, TItem>,
    entries: Record<string, InferOutput<TItem>>,
    raw: unknown,
    logger: Logger,
  ) {
    this.#definition = definition;
    this.#entries = entries;
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [id, value] of Object.entries(raw)) {
        const parsed = v.safeParse(definition.itemSchema, value);
        if (parsed.success) {
          this.#entries[id] = parsed.output;
        } else {
          this.#entries[id] = definition.defaultItem(id);
          logger.warn("collection entry reset to defaults", {
            sliceKey: `${definition.key}/${id}`,
            issues: parsed.issues.map((issue) => issue.message),
          });
        }
      }
    }
  }

  get entries(): Readonly<Record<string, InferOutput<TItem>>> {
    return this.#entries;
  }

  add(id: string, init?: Partial<InferOutput<TItem>>): InferOutput<TItem> {
    const item = { ...(this.#definition.defaultItem(id) as object), ...init } as InferOutput<TItem>;
    this.#entries[id] = item;
    return this.#entries[id];
  }

  remove(id: string): void {
    delete this.#entries[id];
  }

  get(id: string): InferOutput<TItem> | undefined {
    return this.#entries[id];
  }
}
