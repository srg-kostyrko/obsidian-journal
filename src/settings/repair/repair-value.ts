import * as v from "valibot";

import { repairMarkerOf, type RepairMarker } from "./markers";

type AnySchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

export type RepairPath = readonly (string | number)[];
/** Replacement value for a path, or undefined to fall through to delete/drop. */
export type DefaultAt = (path: RepairPath, current: unknown) => { value: unknown } | undefined;
export interface RepairResult<T> {
  value: T;
  fields: string[];
}

interface SchemaNode {
  readonly type: string;
  readonly pipe?: readonly unknown[];
  readonly wrapped?: AnySchema;
  readonly entries?: Readonly<Record<string, AnySchema>>;
  readonly rest?: AnySchema;
  readonly item?: AnySchema;
  readonly value?: AnySchema;
  readonly key?: string;
  readonly options?: readonly AnySchema[];
}

const WRAPPERS = new Set(["optional", "nullable", "nullish", "exact_optional"]);
const OBJECTS = new Set(["object", "loose_object", "strict_object", "object_with_rest"]);

function unwrapOnce(schema: AnySchema): AnySchema | undefined {
  const n: SchemaNode = schema;
  if (WRAPPERS.has(n.type) && n.wrapped !== undefined) return n.wrapped;
  const root = n.pipe?.[0];
  return root === undefined || root === schema ? undefined : (root as AnySchema);
}

function structural(schema: AnySchema): AnySchema {
  let current = schema;
  for (let next = unwrapOnce(current); next !== undefined; next = unwrapOnce(current)) current = next;
  return current;
}

// A marker may sit on any layer: `v.pipe(v.optional(x), climb(…))` and `v.optional(v.pipe(x, climb(…)))`
// both mark the field.
function markerAlong(schema: AnySchema): RepairMarker | undefined {
  for (let current: AnySchema | undefined = schema; current !== undefined; current = unwrapOnce(current)) {
    const marker = repairMarkerOf(current);
    if (marker !== undefined) return marker;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function variantOption(variant: SchemaNode, value: unknown): AnySchema | undefined {
  if (!isRecord(value) || variant.key === undefined) return undefined;
  const options = variant.options ?? [];
  for (const option of options) {
    const shape: SchemaNode = structural(option);
    if (shape.type === "variant") {
      const nested = variantOption(shape, value);
      if (nested !== undefined) return nested;
      continue;
    }
    const discriminant = shape.entries?.[variant.key];
    if (discriminant !== undefined && v.is(discriminant, value[variant.key])) return option;
  }
  return undefined;
}

function firstObjectOption(variant: SchemaNode): AnySchema | undefined {
  let first = variant.options?.[0];
  for (let shape: SchemaNode | undefined = first && structural(first); shape?.type === "variant";) {
    first = shape.options?.[0];
    shape = first && structural(first);
  }
  return first;
}

/** The schema for `key` inside `value`, or undefined where the structure cannot be followed. */
export function childSchemaOf(parent: AnySchema, key: string | number, value: unknown): AnySchema | undefined {
  for (let current: AnySchema | undefined = parent; current !== undefined;) {
    const shape: SchemaNode = structural(current);
    if (OBJECTS.has(shape.type)) {
      if (typeof key !== "string") return undefined;
      return shape.entries !== undefined && Object.hasOwn(shape.entries, key) ? shape.entries[key] : shape.rest;
    }
    if (shape.type === "array") return typeof key === "number" ? shape.item : undefined;
    if (shape.type === "record") return typeof key === "string" ? shape.value : undefined;
    if (shape.type !== "variant") return undefined;
    // An unknown discriminant matches no option, yet its own marker must still be read; every
    // option declares the same key, so the first one stands in for all of them.
    current = variantOption(shape, value) ?? (key === shape.key ? firstObjectOption(shape) : undefined);
  }
  return undefined;
}

const DROPPED: unique symbol = Symbol("dropped");

function childOf(container: unknown, key: string | number): unknown {
  if (Array.isArray(container) && typeof key === "number") return container[key];
  if (isRecord(container) && typeof key === "string") return container[key];
  return undefined;
}

function valueAt(root: unknown, path: RepairPath): unknown {
  let current = root;
  for (const key of path) current = childOf(current, key);
  return current;
}

// Dropped items stay in the working copy as tombstones so every recorded path keeps pointing at
// the item it named, however many siblings drop around it; only the parse sees them removed.
function withoutDropped(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((item) => item !== DROPPED).map(withoutDropped);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([k, item]) => [k, withoutDropped(item)]));
  return value;
}

// Issue paths index the tombstone-free copy the parse saw; map them back onto the working copy.
function toWorkingPath(root: unknown, keys: RepairPath): (string | number)[] {
  const out: (string | number)[] = [];
  let current = root;
  for (const key of keys) {
    const mapped = Array.isArray(current) && typeof key === "number" ? liveIndex(current, key) : key;
    out.push(mapped);
    current = childOf(current, mapped);
  }
  return out;
}

function liveIndex(list: readonly unknown[], live: number): number {
  let seen = -1;
  for (const [index, item] of list.entries()) {
    if (item !== DROPPED) seen++;
    if (seen === live) return index;
  }
  return live;
}

function issueKeys(issue: v.BaseIssue<unknown>): RepairPath | undefined {
  const path = issue.path;
  if (path === undefined || path.length === 0) return undefined;
  const keys: (string | number)[] = [];
  for (const item of path) {
    if (typeof item.key !== "string" && typeof item.key !== "number") return undefined;
    keys.push(item.key);
  }
  return keys;
}

function truncateAtMarkers(schema: AnySchema, root: unknown, path: RepairPath): RepairPath {
  let parentSchema: AnySchema | undefined = schema;
  let parentValue = root;
  for (const [index, key] of path.entries()) {
    if (parentSchema === undefined) return path;
    const child = childSchemaOf(parentSchema, key, parentValue);
    if (child === undefined) return path;
    const marker = markerAlong(child);
    if (marker === "climb") return path.slice(0, index);
    if (marker === "whole") return path.slice(0, index);
    parentSchema = child;
    parentValue = childOf(parentValue, key);
  }
  return path;
}

function isPrefix(prefix: RepairPath, path: RepairPath): boolean {
  return prefix.length <= path.length && prefix.every((key, index) => path[index] === key);
}

/** Repairs `raw` at the depth of each failure, climbing toward the root only as far as it must. */
export function repairValue<TSchema extends AnySchema>(
  schema: TSchema,
  raw: unknown,
  defaultAt: DefaultAt,
): RepairResult<v.InferOutput<TSchema>> | undefined {
  const working: unknown = structuredClone(raw);
  let applied: RepairPath[] = [];
  let deepest = 0;

  const apply = (start: RepairPath): boolean => {
    let target = start;
    // Set when the target is a list that refused to drop its last live item: deleting or
    // defaulting that list would empty it just the same, so only dropping it from its own
    // parent list, or climbing past it, is allowed.
    let keepList = false;
    for (;;) {
      const key = target.at(-1);
      if (key === undefined) return false;
      const parentPath = target.slice(0, -1);
      const container = valueAt(working, parentPath);
      if (!keepList) {
        const replacement = defaultAt(target, childOf(container, key));
        if (replacement !== undefined && (Array.isArray(container) || isRecord(container))) {
          (container as Record<string | number, unknown>)[key] = structuredClone(replacement.value);
          break;
        }
        if (isRecord(container) && typeof key === "string") {
          Reflect.deleteProperty(container, key);
          break;
        }
      }
      // Dropping the last live item would turn "these items" into "no items", which a list's
      // default usually reads as "any"; the parent is the honest unit to lose instead.
      const inList = Array.isArray(container) && typeof key === "number";
      if (inList && liveCount(container) > 1) {
        container[key] = DROPPED;
        break;
      }
      target = truncateAtMarkers(schema, working, parentPath);
      keepList = inList && target.length === parentPath.length;
    }
    applied = applied.filter((path) => !isPrefix(target, path));
    applied.push(target);
    return true;
  };

  for (let round = 0; ; round++) {
    const parsed = v.safeParse(schema, withoutDropped(working));
    if (parsed.success) {
      return { value: parsed.output, fields: applied.map((path) => path.join(".")) };
    }
    if (round > deepest) return undefined;

    const targets: RepairPath[] = [];
    for (const issue of parsed.issues) {
      const keys = issueKeys(issue);
      if (keys === undefined) return undefined;
      deepest = Math.max(deepest, keys.length);
      let target = truncateAtMarkers(schema, working, toWorkingPath(working, keys));
      const covering = applied.filter((path) => isPrefix(path, target)).toSorted((a, b) => a.length - b.length)[0];
      if (covering !== undefined) target = truncateAtMarkers(schema, working, covering.slice(0, -1));
      targets.push(target);
    }

    const distinct = targets.filter((target, index) =>
      targets.every(
        (other, otherIndex) => !isPrefix(other, target) || (other.length >= target.length && otherIndex >= index),
      ),
    );
    for (const target of distinct) {
      if (applied.some((path) => isPrefix(path, target))) continue;
      if (!apply(target)) return undefined;
    }
  }
}

function liveCount(list: readonly unknown[]): number {
  return list.filter((item) => item !== DROPPED).length;
}

/** Top-level defaults only: deeper fields fall through to their own `v.optional` default. */
export function defaultsFrom(top: Record<string, unknown>): DefaultAt {
  return (path) => {
    const key = path.length === 1 ? path[0] : undefined;
    return typeof key === "string" && Object.hasOwn(top, key) ? { value: top[key] } : undefined;
  };
}
