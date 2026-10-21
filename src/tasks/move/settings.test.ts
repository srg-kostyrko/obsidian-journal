import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { effectiveMove, journalMoveSchema } from "./settings";

describe("effectiveMove", () => {
  it("a journal with no move block inherits copy and stamp", () => {
    expect(effectiveMove(v.parse(journalMoveSchema, {}), { mode: "copy", stamp: true })).toEqual({
      mode: "copy",
      stamp: true,
      source: "note",
      targetHeading: "",
      lookBack: 1,
    });
  });

  it("a journal's own mode and stamp override the defaults", () => {
    const resolved = effectiveMove(v.parse(journalMoveSchema, { mode: "move", stamp: false }), {
      mode: "copy",
      stamp: true,
    });
    expect(resolved.mode).toBe("move");
    expect(resolved.stamp).toBe(false);
  });
});

describe("journalMoveSchema", () => {
  it("lookBack below one does not parse", () => {
    expect(v.safeParse(journalMoveSchema, { lookBack: 0 }).success).toBe(false);
  });
});
