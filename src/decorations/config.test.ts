import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { decorationConditionSchema } from "./config";

// Interval offsets are 1-based in both directions (1 = first day, -1 = last day), so a
// stored 0 could never match anything. It is coerced rather than rejected, since existing
// configs carry it.
describe("offset condition schema", () => {
  it("reads a stored zero offset as the interval's first day", () => {
    const parsed = v.parse(decorationConditionSchema, { type: "offset", offset: 0 });
    expect(parsed).toEqual({ type: "offset", offset: 1 });
  });

  it("leaves a non-zero offset untouched", () => {
    const parsed = v.parse(decorationConditionSchema, { type: "offset", offset: -3 });
    expect(parsed).toEqual({ type: "offset", offset: -3 });
  });
});

describe("note-size condition schema", () => {
  it("parses a note-size condition", () => {
    const result = v.safeParse(decorationConditionSchema, {
      type: "note-size",
      unit: "words",
      condition: "gt",
      value: 250,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative note-size threshold", () => {
    const result = v.safeParse(decorationConditionSchema, {
      type: "note-size",
      unit: "words",
      condition: "gt",
      value: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an eq operator on a note-size condition", () => {
    const result = v.safeParse(decorationConditionSchema, {
      type: "note-size",
      unit: "words",
      condition: "eq",
      value: 250,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a fractional note-size threshold", () => {
    const result = v.safeParse(decorationConditionSchema, {
      type: "note-size",
      unit: "words",
      condition: "gt",
      value: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("has-notelet condition schema", () => {
  it("defaults typeIds to an empty list", () => {
    expect(v.parse(decorationConditionSchema, { type: "has-notelet" })).toEqual({
      type: "has-notelet",
      typeIds: [],
    });
  });

  it("keeps the stored type ids", () => {
    expect(v.parse(decorationConditionSchema, { type: "has-notelet", typeIds: ["nt_a", "nt_b"] })).toEqual({
      type: "has-notelet",
      typeIds: ["nt_a", "nt_b"],
    });
  });

  it("rejects a non-array typeIds", () => {
    expect(() => v.parse(decorationConditionSchema, { type: "has-notelet", typeIds: "nt_a" })).toThrow();
  });
});
