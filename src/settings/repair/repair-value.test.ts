import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { climb, whole } from "./markers";
import { childSchemaOf, defaultsFrom, repairValue, type DefaultAt } from "./repair-value";

const noDefaults = defaultsFrom({});
const typeDefault: DefaultAt = (path) => (path.at(-1) === "type" ? { value: "a" } : undefined);

const segmentSchema = v.object({
  label: v.string(),
  link: v.optional(v.picklist(["none", "self"]), "none"),
});
const linesSchema = v.object({ lines: v.array(v.array(segmentSchema)) });

function lines(): { lines: { label: unknown; link: unknown }[][] } {
  return {
    lines: [
      [
        { label: "a", link: "self" },
        { label: "b", link: "self" },
      ],
      [
        { label: "c", link: "self" },
        { label: "d", link: "self" },
      ],
    ],
  };
}

describe("repairValue", () => {
  it("resets one deep field to its optional default and keeps every sibling", () => {
    const raw = lines();
    raw.lines[1][0].link = "future";

    const result = repairValue(linesSchema, raw, noDefaults);

    const expected = lines();
    expected.lines[1][0].link = "none";
    expect(result).toEqual({ value: expected, fields: ["lines.1.0.link"] });
  });

  it("drops the item when its field has no default", () => {
    const raw = lines();
    raw.lines[0][1].label = 5;

    const result = repairValue(linesSchema, raw, noDefaults);

    const expected = lines();
    expected.lines[0].splice(1, 1);
    expect(result).toEqual({ value: expected, fields: ["lines.0.1"] });
  });

  it("climbs when dropping would empty a non-empty list", () => {
    const schema = v.object({ rules: v.array(v.object({ ids: v.array(v.string()) })) });

    const result = repairValue(schema, { rules: [{ ids: [7] }, { ids: ["x"] }] }, noDefaults);

    expect(result).toEqual({ value: { rules: [{ ids: ["x"] }] }, fields: ["rules.0"] });
  });

  it("drops the item rather than empty a non-empty list whose default is empty", () => {
    const schema = v.object({
      conditions: v.array(v.object({ typeIds: v.optional(v.array(v.string()), () => []) })),
    });

    const result = repairValue(schema, { conditions: [{ typeIds: [7] }, { typeIds: ["b"] }] }, noDefaults);

    expect(result).toEqual({ value: { conditions: [{ typeIds: ["b"] }] }, fields: ["conditions.0"] });
  });

  it("honours climb on a discriminant", () => {
    const schema = v.object({
      items: v.array(
        v.variant("type", [
          v.object({ type: v.pipe(v.literal("a"), climb("discriminant")), n: v.number() }),
          v.object({ type: v.pipe(v.literal("b"), climb("discriminant")) }),
        ]),
      ),
    });

    const result = repairValue(schema, { items: [{ type: "zzz", n: 1 }, { type: "b" }] }, typeDefault);

    expect(result).toEqual({ value: { items: [{ type: "b" }] }, fields: ["items.0"] });
  });

  it("honours whole on a list", () => {
    const cond = v.object({ day: v.number() });
    const schema = v.object({
      decorations: v.array(
        v.object({
          conditions: v.pipe(v.array(cond), whole("dropping a condition changes what the decoration matches")),
          color: v.string(),
        }),
      ),
    });
    const raw = {
      decorations: [
        { conditions: [{ day: "bad" }, { day: 2 }], color: "red" },
        { conditions: [{ day: 3 }], color: "blue" },
      ],
    };

    const result = repairValue(schema, raw, noDefaults);

    expect(result).toEqual({
      value: { decorations: [{ conditions: [{ day: 3 }], color: "blue" }] },
      fields: ["decorations.0"],
    });
  });

  it("repairs a whole list of the wrong shape at its parent instead of defaulting it", () => {
    const schema = v.object({
      decorations: v.array(
        v.object({
          conditions: v.optional(v.pipe(v.array(v.object({ day: v.number() })), whole("conditions")), () => []),
          color: v.string(),
        }),
      ),
    });
    const raw = {
      decorations: [
        { conditions: "bad", color: "red" },
        { conditions: [{ day: 3 }], color: "blue" },
      ],
    };

    const result = repairValue(schema, raw, noDefaults);

    expect(result).toEqual({
      value: { decorations: [{ conditions: [{ day: 3 }], color: "blue" }] },
      fields: ["decorations.0"],
    });
  });

  it("reads a marker through a record", () => {
    const schema = v.object({
      byId: v.record(
        v.string(),
        v.object({ name: v.string(), kind: v.optional(v.pipe(v.picklist(["x", "y"]), climb("kind")), "x") }),
      ),
    });
    const raw = { byId: { first: { name: "f", kind: "zzz" }, other: { name: "o", kind: "y" } } };

    const result = repairValue(schema, raw, noDefaults);

    expect(result).toEqual({ value: { byId: { other: { name: "o", kind: "y" } } }, fields: ["byId.first"] });
  });

  it("climbs when a default fails an object-level check", () => {
    const schema = v.object({
      ranges: v.array(
        v.pipe(
          v.object({ min: v.optional(v.number(), 0), max: v.number() }),
          v.check((range) => range.min <= range.max),
        ),
      ),
    });
    const raw = {
      ranges: [
        { min: 1, max: 5 },
        { min: "x", max: -1 },
      ],
    };

    const result = repairValue(schema, raw, noDefaults);

    expect(result).toEqual({ value: { ranges: [{ min: 1, max: 5 }] }, fields: ["ranges.1"] });
  });

  it("climbs past a parent of the wrong shape", () => {
    const raw = { lines: [[null], [{ label: "c", link: "self" }]] };

    const result = repairValue(linesSchema, raw, noDefaults);

    expect(result).toEqual({ value: { lines: [[{ label: "c", link: "self" }]] }, fields: ["lines.0"] });
  });

  it("applies overlapping repairs without index drift", () => {
    const schema = v.object({
      items: v.array(v.object({ name: v.string(), size: v.optional(v.number(), 1) })),
    });
    const raw = {
      items: [
        { name: 0, size: 2 },
        { name: "keep", size: 3 },
        { name: 2, size: 4 },
        { name: "reset", size: "big" },
      ],
    };

    const result = repairValue(schema, raw, noDefaults);

    expect(result?.value).toEqual({
      items: [
        { name: "keep", size: 3 },
        { name: "reset", size: 1 },
      ],
    });
    expect(result?.fields.toSorted()).toEqual(["items.0", "items.2", "items.3.size"]);
  });

  it("follows a later round's issue past an item already dropped", () => {
    const schema = v.object({ items: v.array(v.object({ name: v.string(), size: v.number() })) });
    const raw = { items: [null, { name: "a", size: "x" }, { name: "b", size: 2 }] };

    const result = repairValue(schema, raw, noDefaults);

    expect(result).toEqual({ value: { items: [{ name: "b", size: 2 }] }, fields: ["items.0", "items.1"] });
  });

  it("uses defaultAt before deleting", () => {
    const schema = v.object({ name: v.pipe(v.string(), v.minLength(1)), count: v.number() });

    const result = repairValue(schema, { name: "", count: 4 }, defaultsFrom({ name: "x" }));

    expect(result).toEqual({ value: { name: "x", count: 4 }, fields: ["name"] });
  });

  it("returns undefined when the issue has no path", () => {
    const schema = v.pipe(
      v.object({ a: v.number(), b: v.number() }),
      v.check((value) => value.a < value.b),
    );

    expect(repairValue(schema, { a: 2, b: 1 }, defaultsFrom({ a: 0, b: 1 }))).toBeUndefined();
  });

  it("runs a transform once on the repaired value", () => {
    const seen: number[] = [];
    const schema = v.object({
      doubled: v.pipe(
        v.number(),
        v.transform((n) => {
          seen.push(n);
          return n * 2;
        }),
      ),
      flag: v.optional(v.boolean(), false),
    });

    const result = repairValue(schema, { doubled: 3, flag: "yes" }, noDefaults);

    expect(result).toEqual({ value: { doubled: 6, flag: false }, fields: ["flag"] });
    expect(new Set(seen)).toEqual(new Set([3]));
  });

  it("leaves the caller's raw value untouched", () => {
    const raw = lines();
    raw.lines[0][1].label = 5;
    const before = structuredClone(raw);

    repairValue(linesSchema, raw, noDefaults);

    expect(raw).toEqual(before);
  });
});

describe("childSchemaOf", () => {
  it("does not resolve a prototype key as an object entry", () => {
    expect(childSchemaOf(v.object({ a: v.string() }), "constructor", {})).toBeUndefined();
  });
});
