import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { automaticBlocked, effectiveMove, journalMoveSchema } from "./settings";

describe("effectiveMove", () => {
  it("a journal with no move block inherits copy and stamp", () => {
    expect(effectiveMove(v.parse(journalMoveSchema, {}), { mode: "copy", stamp: true })).toEqual({
      mode: "copy",
      stamp: true,
      source: "note",
      targetHeading: "",
      lookBack: 1,
      automatic: false,
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

describe("automatic", () => {
  it("automatic defaults off", () => {
    expect(v.parse(journalMoveSchema, {}).automatic).toBe(false);
  });
});

const resolve = (move: object, defaults: { mode: "copy" | "move"; stamp: boolean }) =>
  effectiveMove(v.parse(journalMoveSchema, move), defaults);

describe("automaticBlocked", () => {
  it("blocks copy without stamping", () => {
    expect(automaticBlocked(resolve({ mode: "copy", stamp: false }, { mode: "copy", stamp: true }))).toBe(
      "copy-without-stamp",
    );
  });

  it("allows copy with stamping", () => {
    expect(automaticBlocked(resolve({}, { mode: "copy", stamp: true }))).toBeNull();
  });

  it("allows move whatever the stamp says", () => {
    expect(automaticBlocked(resolve({ mode: "move", stamp: false }, { mode: "copy", stamp: true }))).toBeNull();
  });

  it("blocks through an inherited global default", () => {
    expect(automaticBlocked(resolve({}, { mode: "copy", stamp: false }))).toBe("copy-without-stamp");
  });

  it("a journal's own stamp overrides a global default that would block", () => {
    expect(automaticBlocked(resolve({ stamp: true }, { mode: "copy", stamp: false }))).toBeNull();
  });
});
