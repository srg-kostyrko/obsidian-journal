import * as v from "valibot";

import { repairMarkerOf, type RepairMarker } from "./markers";

type AnySchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

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
  readonly literal?: string | number | bigint | boolean | symbol;
}

const WRAPPERS = new Set(["optional", "nullable", "nullish", "exact_optional"]);
const DEFAULTING_WRAPPERS = new Set(["optional", "nullish", "exact_optional"]);
const OBJECTS = new Set(["object", "loose_object", "strict_object", "object_with_rest"]);

function unwrapOnce(schema: AnySchema): AnySchema | undefined {
  const n: SchemaNode = schema;
  if (WRAPPERS.has(n.type) && n.wrapped !== undefined) return n.wrapped;
  const root = n.pipe?.[0];
  return root === undefined || root === schema ? undefined : (root as AnySchema);
}

function* layers(schema: AnySchema): Generator<AnySchema> {
  for (let current: AnySchema | undefined = schema; current !== undefined; current = unwrapOnce(current)) {
    yield current;
  }
}

function structural(schema: AnySchema): AnySchema {
  let current = schema;
  for (const layer of layers(schema)) current = layer;
  return current;
}

// A marker may sit on any layer: `v.pipe(v.optional(x), climb(…))` and `v.optional(v.pipe(x, climb(…)))`
// both mark the field.
export function markerAlong(schema: AnySchema): RepairMarker | undefined {
  for (const layer of layers(schema)) {
    const marker = repairMarkerOf(layer);
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

export function isRecordSchema(schema: AnySchema): boolean {
  return structural(schema).type === "record";
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

export interface GateViolation {
  root: string;
  path: string;
  reason: "no-default" | "discriminant-unmarked" | "union-should-be-variant";
}

// `v.fallback` keeps the wrapped schema's type and adds a `fallback` property, so it can only be
// recognized by that property, on whichever layer it was applied to.
function hasDefault(schema: AnySchema): boolean {
  for (const layer of layers(schema)) {
    if (DEFAULTING_WRAPPERS.has(layer.type) || "fallback" in layer) return true;
  }
  return false;
}

function discriminantValues(entry: AnySchema): readonly unknown[] | undefined {
  const shape: SchemaNode & { options?: readonly unknown[] } = structural(entry);
  if (shape.type === "literal") return [shape.literal];
  if (shape.type === "picklist") return shape.options;
  return undefined;
}

function sharedDiscriminantKey(options: readonly AnySchema[]): string | undefined {
  const shapes: SchemaNode[] = options.map((option) => structural(option));
  const first = shapes.at(0);
  if (first === undefined || shapes.some((shape) => !OBJECTS.has(shape.type))) return undefined;
  return Object.keys(first.entries ?? {}).find((key) => {
    const seen = new Set<unknown>();
    return shapes.every((shape) => {
      const entry = shape.entries?.[key];
      const values = entry === undefined ? undefined : discriminantValues(entry);
      if (values === undefined || values.some((value) => seen.has(value))) return false;
      for (const value of values) seen.add(value);
      return true;
    });
  });
}

function optionLabel(option: SchemaNode, key: string | undefined, index: number): string {
  const entry = key === undefined ? undefined : option.entries?.[key];
  const values = entry === undefined ? undefined : discriminantValues(entry);
  return key === undefined || values === undefined ? `(${index})` : `(${key}=${values.map(String).join("|")})`;
}

function field(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

/** Fields below each root's top level that the deep repair could not default, and shapes it cannot follow. */
export function gateViolations(
  root: string,
  schema: AnySchema,
  options?: { skipKeys?: readonly string[] },
): GateViolation[] {
  const out: GateViolation[] = [];
  const skipKeys = new Set(options?.skipKeys);
  const report = (path: string, reason: GateViolation["reason"]): void => {
    out.push({ root, path, reason });
  };

  const walk = (node: AnySchema, path: string, topLevel: boolean, discriminant?: string): void => {
    const shape: SchemaNode = structural(node);
    if (OBJECTS.has(shape.type)) {
      const entries = Object.entries(shape.entries ?? {});
      for (const [key, entry] of entries) {
        if (topLevel && skipKeys.has(key)) continue;
        const entryPath = field(path, key);
        const marker = markerAlong(entry);
        if (key === discriminant) {
          if (!topLevel && marker !== "climb") report(entryPath, "discriminant-unmarked");
          continue;
        }
        if (marker !== undefined) continue;
        if (!topLevel && !hasDefault(entry)) report(entryPath, "no-default");
        walk(entry, entryPath, false);
      }
      if (shape.rest !== undefined) walk(shape.rest, field(path, "*"), false);
      return;
    }
    if (shape.type === "array" && shape.item !== undefined) walk(shape.item, `${path}[]`, false);
    else if (shape.type === "record" && shape.value !== undefined) walk(shape.value, field(path, "*"), false);
    else if (shape.type === "variant") {
      const variantOptions = shape.options ?? [];
      for (const [index, option] of variantOptions.entries()) {
        const optionShape: SchemaNode = structural(option);
        const optionPath =
          optionShape.type === "variant" ? path : `${path}${optionLabel(optionShape, shape.key, index)}`;
        walk(option, optionPath, topLevel, shape.key);
      }
    } else if (shape.type === "union") {
      const unionOptions = shape.options ?? [];
      const shared = sharedDiscriminantKey(unionOptions);
      if (shared !== undefined) report(path, "union-should-be-variant");
      for (const [index, option] of unionOptions.entries()) {
        walk(option, `${path}${optionLabel(structural(option), shared, index)}`, topLevel);
      }
    }
  };

  walk(schema, "", true);
  return out;
}
