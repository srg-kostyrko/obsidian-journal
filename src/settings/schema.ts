import type { BaseIssue, BaseSchema, InferOutput } from "valibot";

type AnySchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>;

export interface SliceDefinition<TKey extends string, TSchema extends AnySchema> {
  readonly __brand: "slice";
  readonly key: TKey;
  readonly schema: TSchema;
  readonly defaults: InferOutput<TSchema>;
}

// Keyed on the item type's own field names so a nested definition for a key the item schema
// doesn't have is a compile error. The stronger invariant — that a NestedCollectionDefinition's
// itemSchema IS the schema that validates values stored at that key — has no type to express it
// and must be gotten right by construction.
export type CollectionNested<TItem extends AnySchema> = Readonly<
  Partial<Record<Extract<keyof InferOutput<TItem>, string>, AnyNestedCollectionDefinition>>
>;

export interface CollectionDefinition<TKey extends string, TItem extends AnySchema> {
  readonly __brand: "collection";
  readonly key: TKey;
  readonly itemSchema: TItem;
  /** `raw` is the stored entry that failed validation, so a default can keep what still parses. */
  readonly defaultItem: (id: string, raw?: unknown) => InferOutput<TItem>;
  readonly seed?: () => Record<string, InferOutput<TItem>>;
  readonly nested?: CollectionNested<TItem>;
}

export interface NestedCollectionDefinition<TItem extends AnySchema> {
  readonly itemSchema: TItem;
  readonly defaultItem: (id: string, raw?: unknown) => InferOutput<TItem>;
}

export type AnySliceDefinition = SliceDefinition<string, AnySchema>;
export type AnyCollectionDefinition = CollectionDefinition<string, AnySchema>;
export type AnyNestedCollectionDefinition = NestedCollectionDefinition<AnySchema>;

export function defineNestedCollection<TItem extends AnySchema>(
  itemSchema: TItem,
  defaultItem: (id: string, raw?: unknown) => InferOutput<TItem>,
): NestedCollectionDefinition<TItem> {
  return { itemSchema, defaultItem };
}

export function defineSlice<TKey extends string, TSchema extends AnySchema>(
  key: TKey,
  schema: TSchema,
  defaults: InferOutput<TSchema>,
): SliceDefinition<TKey, TSchema> {
  return { __brand: "slice", key, schema, defaults };
}

export function defineCollection<TKey extends string, TItem extends AnySchema>(
  key: TKey,
  itemSchema: TItem,
  defaultItem: (id: string, raw?: unknown) => InferOutput<TItem>,
  options?: {
    seed?: () => Record<string, InferOutput<TItem>>;
    nested?: CollectionNested<TItem>;
  },
): CollectionDefinition<TKey, TItem> {
  return { __brand: "collection", key, itemSchema, defaultItem, seed: options?.seed, nested: options?.nested };
}

export interface Migration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(raw: Record<string, unknown>): Record<string, unknown>;
}
