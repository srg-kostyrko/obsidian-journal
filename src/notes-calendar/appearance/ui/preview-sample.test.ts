import { describe, expect, it } from "vitest";

import { date } from "@/calendar/testing";

import { partsAt, sampleDays } from "./preview-sample";

// Builds a chain of nested spans, outermost first, and returns the innermost, the click's target.
function element(...chain: readonly Record<string, string>[]): Element {
  let target: Element = document.createElement("div");
  for (const attributes of chain) {
    const child = document.createElement("span");
    for (const [name, value] of Object.entries(attributes)) child.setAttribute(name, value);
    target.append(child);
    target = child;
  }
  return target;
}

const CELL = "notes-calendar-cell";

describe("sampleDays", () => {
  it("shows today's month", () => {
    expect(sampleDays(date("2026-05-13")).month.start.toAnchor()).toBe("2026-05-01");
  });

  it("opens the note two days after today, and selects the day it opens", () => {
    const sample = sampleDays(date("2026-05-13"));
    expect(sample.active).toBe("2026-05-15");
    expect(sample.selected).toBe("2026-05-15");
  });

  it("clamps the open note to the month's last day", () => {
    expect(sampleDays(date("2026-05-30")).active).toBe("2026-05-31");
  });

  it("clamps the open note to February's last day", () => {
    expect(sampleDays(date("2026-02-27")).active).toBe("2026-02-28");
  });

  it.each(["2026-05-01", "2026-05-13", "2026-05-30", "2026-05-31", "2026-02-28"])(
    "leaves today alone: neither open, selected nor decorated (today %s)",
    (today) => {
      const sample = sampleDays(date(today));
      expect(sample.active).not.toBe(today);
      expect(sample.selected).not.toBe(today);
      expect(sample.decorated).not.toContain(today);
      expect(sample.month.contains(date(sample.active))).toBe(true);
    },
  );

  it.each(["2026-05-01", "2026-05-13", "2026-05-30", "2026-05-31", "2026-02-28"])(
    "decorates one plain day of the month (today %s)",
    (today) => {
      const sample = sampleDays(date(today));
      expect(sample.decorated).toHaveLength(1);
      const plain = sample.decorated.at(0) ?? "";
      expect(plain).not.toBe(sample.active);
      expect(plain).not.toBe(sample.selected);
      expect(sample.month.contains(date(plain))).toBe(true);
    },
  );
});

describe("partsAt", () => {
  it("names a selected day that is today, most specific first", () => {
    const target = element(
      { class: CELL, "data-preview-part": "date", "data-today": "true", "data-selected": "true" },
      { class: "notes-calendar-cell__text" },
      {},
    );
    expect(partsAt(target)).toEqual(["selected", "today", "date", "cell"]);
  });

  it("names the current week number before the today it contains", () => {
    const target = element({ class: CELL, "data-preview-part": "weekNumber", "data-today": "true" });
    expect(partsAt(target)).toEqual(["weekNumber", "today"]);
  });

  it("names a weekday header", () => {
    expect(partsAt(element({ "data-preview-part": "weekday" }))).toEqual(["weekday"]);
  });

  it("names the heading's month cell before the today it contains", () => {
    const target = element({ "data-preview-part": "heading" }, { class: CELL, "data-today": "true" }, {});
    expect(partsAt(target)).toEqual(["heading", "today"]);
  });

  it("names an outside day", () => {
    const target = element({ class: CELL, "data-preview-part": "date", "data-outside": "true" });
    expect(partsAt(target)).toEqual(["outside", "date", "cell"]);
  });

  it("names the open note's day that is also selected, the open note first", () => {
    const target = element({
      class: CELL,
      "data-preview-part": "date",
      "data-active": "true",
      "data-selected": "true",
    });
    expect(partsAt(target)).toEqual(["active", "selected", "date", "cell"]);
  });

  it("names the open note's day", () => {
    const target = element({ class: CELL, "data-preview-part": "date", "data-active": "true" });
    expect(partsAt(target)).toEqual(["active", "date", "cell"]);
  });

  it("names nothing outside every part", () => {
    expect(partsAt(element({}))).toEqual([]);
  });
});
