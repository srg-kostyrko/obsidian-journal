import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { climb, whole } from "./markers";
import { childSchemaOf, gateViolations } from "./schema-walk";

describe("gateViolations", () => {
  it("passes a schema that follows every rule", () => {
    const schema = v.object({
      name: v.string(),
      nested: v.object({
        a: v.optional(v.string(), ""),
        b: v.nullish(v.number()),
        c: v.exactOptional(v.boolean()),
        d: v.fallback(v.string(), "x"),
        e: v.pipe(v.string(), climb("every default changes meaning")),
        f: v.optional(v.pipe(v.string(), climb("either layer"))),
        g: v.pipe(v.optional(v.string(), ""), v.minLength(0)),
      }),
      shapes: v.array(
        v.variant("kind", [
          v.object({ kind: v.pipe(v.literal("dot"), climb("a kind decides every other field")) }),
          v.object({
            kind: v.pipe(v.literal("ring"), climb("a kind decides every other field")),
            width: v.optional(v.number(), 1),
          }),
        ]),
      ),
      byId: v.record(v.string(), v.object({ label: v.optional(v.string(), "") })),
    });

    expect(gateViolations("root", schema)).toEqual([]);
  });

  it("reports a field below the top level with neither a default nor a marker", () => {
    const schema = v.object({ top: v.string(), nested: v.object({ bare: v.string(), kept: v.optional(v.string()) }) });

    expect(gateViolations("root", schema)).toEqual([{ root: "root", path: "nested.bare", reason: "no-default" }]);
  });

  it("does not count nullable as a default", () => {
    const schema = v.object({ nested: v.object({ maybe: v.nullable(v.string()) }) });

    expect(gateViolations("root", schema)).toEqual([{ root: "root", path: "nested.maybe", reason: "no-default" }]);
  });

  it("reports fields inside array items, record values and object rest", () => {
    const schema = v.object({
      list: v.array(v.object({ a: v.string() })),
      map: v.record(v.string(), v.object({ b: v.string() })),
      rest: v.objectWithRest({}, v.object({ c: v.string() })),
    });

    expect(gateViolations("root", schema)).toEqual([
      { root: "root", path: "list[].a", reason: "no-default" },
      { root: "root", path: "map.*.b", reason: "no-default" },
      { root: "root", path: "rest.*.c", reason: "no-default" },
    ]);
  });

  it("treats the items of a non-object root as below the top level", () => {
    const schema = v.array(v.object({ a: v.string() }));

    expect(gateViolations("root", schema)).toEqual([{ root: "root", path: "[].a", reason: "no-default" }]);
  });

  it("exempts the entries of every option of a root variant, its unmarked discriminant included", () => {
    const schema = v.variant("kind", [
      v.object({ kind: v.literal("a"), x: v.string() }),
      v.object({ kind: v.literal("b"), y: v.object({ deep: v.string() }) }),
    ]);

    expect(gateViolations("root", schema)).toEqual([{ root: "root", path: "(kind=b).y.deep", reason: "no-default" }]);
  });

  it("treats lazy, intersect, tuple, map and set as leaves", () => {
    const bare = v.object({ bare: v.string() });
    const schema = v.object({
      nested: v.object({
        lazy: v.optional(v.lazy(() => bare)),
        intersect: v.optional(v.intersect([bare, v.object({ other: v.string() })])),
        tuple: v.optional(v.tuple([bare])),
        map: v.optional(v.map(v.string(), bare)),
        set: v.optional(v.set(bare)),
      }),
    });

    expect(gateViolations("root", schema)).toEqual([]);
  });

  it("skips everything under a climb-marked field or a whole-marked list", () => {
    const schema = v.object({
      nested: v.object({
        climbed: v.pipe(v.object({ bare: v.string() }), climb("defaults below are never used")),
        list: v.pipe(v.array(v.object({ bare: v.string() })), whole("one bad item drops the parent")),
      }),
    });

    expect(gateViolations("root", schema)).toEqual([]);
  });

  it("requires every variant discriminant below the top level to carry climb", () => {
    const schema = v.object({
      nested: v.optional(
        v.variant("kind", [
          v.object({ kind: v.literal("a") }),
          v.object({ kind: v.pipe(v.literal("b"), climb("kind")), extra: v.string() }),
        ]),
      ),
      list: v.array(v.variant("type", [v.object({ type: v.optional(v.literal("c"), "c") })])),
    });

    expect(gateViolations("root", schema)).toEqual([
      { root: "root", path: "nested(kind=a).kind", reason: "discriminant-unmarked" },
      { root: "root", path: "nested(kind=b).extra", reason: "no-default" },
      { root: "root", path: "list[](type=c).type", reason: "discriminant-unmarked" },
    ]);
  });

  it("reports a union of objects sharing a literal key, and still checks its options", () => {
    const schema = v.object({
      nested: v.optional(
        v.union([
          v.object({ kind: v.literal("a"), x: v.optional(v.string()) }),
          v.object({ kind: v.optional(v.literal("b")), y: v.string() }),
        ]),
      ),
    });

    expect(gateViolations("root", schema)).toEqual([
      { root: "root", path: "nested", reason: "union-should-be-variant" },
      { root: "root", path: "nested(kind=a).kind", reason: "no-default" },
      { root: "root", path: "nested(kind=b).y", reason: "no-default" },
    ]);
  });

  it("reports a union of objects told apart by a picklist key", () => {
    const schema = v.object({
      nested: v.optional(
        v.union([
          v.object({ kind: v.pipe(v.picklist(["a", "b"]), climb("kind")), x: v.optional(v.string()) }),
          v.object({ kind: v.pipe(v.literal("c"), climb("kind")), y: v.optional(v.string()) }),
        ]),
      ),
    });

    expect(gateViolations("root", schema)).toEqual([
      { root: "root", path: "nested", reason: "union-should-be-variant" },
    ]);
  });

  it("does not ask for a variant when the key's values overlap across options", () => {
    const schema = v.object({
      nested: v.optional(
        v.union([
          v.object({ kind: v.pipe(v.picklist(["a", "b"]), climb("kind")), x: v.optional(v.string()) }),
          v.object({ kind: v.pipe(v.literal("b"), climb("kind")), y: v.optional(v.string()) }),
        ]),
      ),
    });

    expect(gateViolations("root", schema)).toEqual([]);
  });

  it("treats a union of literals or primitives as a leaf", () => {
    const schema = v.object({
      nested: v.object({
        mode: v.optional(v.union([v.literal("a"), v.literal("b")]), "a"),
        size: v.optional(v.union([v.string(), v.number()]), 0),
      }),
    });

    expect(gateViolations("root", schema)).toEqual([]);
  });

  it("does not ask for a variant when the objects share no all-literal key", () => {
    const schema = v.object({
      nested: v.optional(
        v.union([v.object({ kind: v.literal("a") }), v.object({ kind: v.optional(v.string(), "b") })]),
      ),
    });

    expect(gateViolations("root", schema)).toEqual([{ root: "root", path: "nested(0).kind", reason: "no-default" }]);
  });

  it("leaves out top-level keys walked as their own roots", () => {
    const schema = v.object({
      own: v.record(v.string(), v.object({ bare: v.string() })),
      other: v.object({ bare: v.string() }),
    });

    expect(gateViolations("root", schema, { skipKeys: ["own"] })).toEqual([
      { root: "root", path: "other.bare", reason: "no-default" },
    ]);
  });
});

describe("childSchemaOf", () => {
  it("does not resolve a prototype key as an object entry", () => {
    expect(childSchemaOf(v.object({ a: v.string() }), "constructor", {})).toBeUndefined();
  });
});
