import * as v from "valibot";

import { childSchemaOf, markerAlong } from "./schema-walk";

type AnySchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

export type RepairPath = readonly (string | number)[];
/** Replacement value for a path, or undefined to fall through to delete/drop. */
export type DefaultAt = (path: RepairPath, current: unknown) => { value: unknown } | undefined;
export interface RepairResult<T> {
  value: T;
  fields: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
  let working: unknown = structuredClone(raw);
  let applied: RepairPath[] = [];
  let deepest = 0;

  const empty = (list: RepairPath): RepairPath => {
    const key = list.at(-1);
    if (key === undefined) working = [];
    else (valueAt(working, list.slice(0, -1)) as Record<string | number, unknown>)[key] = [];
    return list;
  };

  const apply = (start: RepairPath): boolean => {
    let target = start;
    // The outermost list that refused to drop its last live item. From there only dropping an
    // enclosing item from a list that keeps others is honest; deleting or defaulting anything
    // on the way up would lose more than emptying this list, which is what the repair falls to.
    let refused: RepairPath | undefined;
    for (;;) {
      const key = target.at(-1);
      if (key === undefined) {
        if (refused === undefined) return false;
        target = empty(refused);
        break;
      }
      const parentPath = target.slice(0, -1);
      const container = valueAt(working, parentPath);
      const inList = Array.isArray(container) && typeof key === "number";
      // Dropping the last live item would turn "these items" into "no items", which a list's
      // default usually reads as "any"; the enclosing item is the honest unit to lose instead.
      const droppable = inList && liveCount(container) > 1;
      const replacement = refused !== undefined && droppable ? undefined : defaultAt(target, childOf(container, key));
      if (replacement !== undefined && (Array.isArray(container) || isRecord(container))) {
        if (refused === undefined) {
          (container as Record<string | number, unknown>)[key] = structuredClone(replacement.value);
        } else {
          target = empty(refused);
        }
        break;
      }
      if (refused === undefined && isRecord(container) && typeof key === "string") {
        Reflect.deleteProperty(container, key);
        break;
      }
      if (droppable) {
        container[key] = DROPPED;
        break;
      }
      if (inList) refused = parentPath;
      target = truncateAtMarkers(schema, working, parentPath);
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
export function defaultsFrom(top: unknown): DefaultAt {
  return (path) => {
    const key = path.length === 1 ? path[0] : undefined;
    return isRecord(top) && typeof key === "string" && Object.hasOwn(top, key) ? { value: top[key] } : undefined;
  };
}
