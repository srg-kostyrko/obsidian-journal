import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { decorationsSliceSchema } from "./slice";

describe("decorationsSliceSchema", () => {
  it("defaults the mark limit to 3 for a payload written before the field existed", () => {
    const parsed = v.parse(decorationsSliceSchema, { decorations: [] });

    expect(parsed.maxMarksPerSlot).toBe(3);
  });

  it("keeps a stored limit", () => {
    const parsed = v.parse(decorationsSliceSchema, { decorations: [], maxMarksPerSlot: 5 });

    expect(parsed.maxMarksPerSlot).toBe(5);
  });

  it("accepts 0, the unlimited value", () => {
    const parsed = v.parse(decorationsSliceSchema, { decorations: [], maxMarksPerSlot: 0 });

    expect(parsed.maxMarksPerSlot).toBe(0);
  });
});
