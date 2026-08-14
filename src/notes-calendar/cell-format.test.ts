import { describe, expect, it } from "vitest";

import { defaultFormatPattern } from "./cell-format";

describe("defaultFormatPattern", () => {
  it("returns 'D' for day", () => {
    expect(defaultFormatPattern("day")).toBe("D");
  });

  it("returns '[W]w' for week", () => {
    // Unpadded week numbers: W1, not W01.
    expect(defaultFormatPattern("week")).toBe("[W]w");
  });

  it("returns 'MMMM' for month", () => {
    // The in-grid month heading shows the full month name.
    expect(defaultFormatPattern("month")).toBe("MMMM");
  });

  it("returns '[Q]Q' for quarter", () => {
    expect(defaultFormatPattern("quarter")).toBe("[Q]Q");
  });

  it("returns 'YYYY' for year", () => {
    expect(defaultFormatPattern("year")).toBe("YYYY");
  });

  it("returns 'YYYY' for decade", () => {
    expect(defaultFormatPattern("decade")).toBe("YYYY");
  });
});
