import { describe, expect, it } from "vitest";

import { defaultFormatPattern } from "./cell-format";

describe("defaultFormatPattern", () => {
  it("returns 'D' for day", () => {
    expect(defaultFormatPattern("day")).toBe("D");
  });

  it("returns '[W]ww' for week", () => {
    expect(defaultFormatPattern("week")).toBe("[W]ww");
  });

  it("returns 'MMM' for month", () => {
    expect(defaultFormatPattern("month")).toBe("MMM");
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
