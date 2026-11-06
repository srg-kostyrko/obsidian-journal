import { moment } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import { CalendarDate, type AnchorString } from "@/calendar";

import { defaultFormatPattern, formatWeekday, labelPattern, weekFormatNeedsIsoWarning } from "./cell-format";

const NO_LABELS = { day: "", week: "", month: "", quarter: "", year: "" };

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

describe("labelPattern", () => {
  it("falls back to the default pattern when the stored one is empty", () => {
    expect(labelPattern(NO_LABELS, "day")).toBe("D");
    expect(labelPattern(NO_LABELS, "decade")).toBe("YYYY");
  });

  it("returns the stored pattern when set", () => {
    expect(labelPattern({ ...NO_LABELS, day: "DD" }, "day")).toBe("DD");
    expect(labelPattern({ ...NO_LABELS, year: "YY" }, "decade")).toBe("YY");
  });
});

describe("formatWeekday", () => {
  const monday = CalendarDate.fromAnchor("2027-02-01" as AnchorString);

  it("formats a pattern label, defaulting to ddd when empty", () => {
    expect(formatWeekday(monday, { type: "pattern", pattern: "" })).toBe(monday.format("ddd"));
    expect(formatWeekday(monday, { type: "pattern", pattern: "dddd" })).toBe("Monday");
  });

  it("renders one letter as a single grapheme", () => {
    const text = formatWeekday(monday, { type: "letter" });
    expect([...new Intl.Segmenter().segment(text)]).toHaveLength(1);
  });

  it("does not throw when moment's locale is an id Intl rejects", () => {
    const original = moment.locale();
    const spy = vi.spyOn(moment, "locale").mockReturnValue("not a locale!!");
    try {
      expect(formatWeekday(monday, { type: "letter" })).not.toBe("");
    } finally {
      spy.mockRestore();
      moment.locale(original);
    }
  });

  it("returns moment's output for an unclosed bracket without throwing", () => {
    expect(() => formatWeekday(monday, { type: "pattern", pattern: "[W" })).not.toThrow();
  });
});

describe("weekFormatNeedsIsoWarning", () => {
  it("warns for the ISO week token only off the ISO grid", () => {
    expect(weekFormatNeedsIsoWarning("[W]W", false)).toBe(true);
    expect(weekFormatNeedsIsoWarning("[W]W", true)).toBe(false);
    expect(weekFormatNeedsIsoWarning("[W]w", false)).toBe(false);
  });
});
