import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";

import { nominalSpanDays } from "./journal-span";

const ANCHOR = anchor("2026-01-01");

describe("nominalSpanDays", () => {
  it("orders the fixed write types from shortest to longest", () => {
    const spans = (["day", "week", "month", "quarter", "year"] as const).map((type) => nominalSpanDays({ type }));

    expect(spans).toStrictEqual(spans.toSorted((a, b) => a - b));
    expect(new Set(spans).size).toBe(spans.length);
  });

  it("sizes a custom journal by its duration, not by its unit alone", () => {
    const tenDays = nominalSpanDays({ type: "custom", every: "day", duration: 10, anchorDate: ANCHOR });

    expect(tenDays).toBeGreaterThan(nominalSpanDays({ type: "week" }));
    expect(tenDays).toBeLessThan(nominalSpanDays({ type: "month" }));
  });

  it("gives a single-unit custom journal the same span as the fixed type it mirrors", () => {
    const everyMonth = nominalSpanDays({ type: "custom", every: "month", duration: 1, anchorDate: ANCHOR });

    expect(everyMonth).toBe(nominalSpanDays({ type: "month" }));
    expect(everyMonth).toBeGreaterThan(nominalSpanDays({ type: "week" }));
  });

  it("places a multi-month custom journal between quarter and year", () => {
    const halfYear = nominalSpanDays({ type: "custom", every: "month", duration: 6, anchorDate: ANCHOR });

    expect(halfYear).toBeGreaterThan(nominalSpanDays({ type: "quarter" }));
    expect(halfYear).toBeLessThan(nominalSpanDays({ type: "year" }));
  });
});
