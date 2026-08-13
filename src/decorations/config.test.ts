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
