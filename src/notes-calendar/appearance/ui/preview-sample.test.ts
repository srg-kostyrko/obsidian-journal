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
const SAT_SUN: ReadonlySet<number> = new Set([0, 6]);

describe("sampleDays", () => {
  it("shows today's month", () => {
    expect(sampleDays(date("2026-05-13"), SAT_SUN).month.start.toAnchor()).toBe("2026-05-01");
  });

  it("opens the note two days after today", () => {
    expect(sampleDays(date("2026-05-13"), SAT_SUN).active).toBe("2026-05-15");
  });

  it("clamps the open note to the month's last day", () => {
    expect(sampleDays(date("2026-05-30"), SAT_SUN).active).toBe("2026-05-31");
  });

  it("clamps the open note to February's last day", () => {
    expect(sampleDays(date("2026-02-27"), SAT_SUN).active).toBe("2026-02-28");
  });

  // The selected day is also a weekend day in today's week, so one sample day shows several states at once.
  it("selects a weekend day of today's week that is neither today nor the open note's", () => {
    expect(sampleDays(date("2026-05-13"), SAT_SUN).selected).toBe("2026-05-16");
    expect(sampleDays(date("2026-05-01"), SAT_SUN).selected).toBe("2026-05-02");
    expect(sampleDays(date("2026-05-13"), new Set([5, 6])).selected).toBe("2026-05-16");
    expect(sampleDays(date("2026-05-11"), new Set([4])).selected).toBe("2026-05-14");
  });

  it("falls back to the month's first free day when today's week has no free weekend day in the month", () => {
    // Today and the open note take both weekend days of the month's last week.
    expect(sampleDays(date("2026-05-30"), SAT_SUN).selected).toBe("2026-05-01");
    expect(sampleDays(date("2026-05-13"), new Set()).selected).toBe("2026-05-01");
  });

  it.each([
    "2026-02-01",
    "2026-02-02",
    "2026-02-27",
    "2026-02-28",
    "2028-02-29",
    "2026-05-01",
    "2026-05-13",
    "2026-05-30",
    "2026-05-31",
    "2026-04-30",
  ])(
    "gives today, the open note and the selected day a day each, and decorates only the selected (today %s)",
    (today) => {
      const sample = sampleDays(date(today), SAT_SUN);
      expect(new Set([today, sample.active, sample.selected]).size).toBe(3);
      for (const anchor of [today, sample.active, sample.selected]) {
        expect(sample.month.contains(date(anchor))).toBe(true);
      }
      expect(sample.decorated).toEqual([sample.selected]);
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

  it("names the month grid last for anything inside it", () => {
    const day = element(
      { "data-preview-grid": "" },
      { class: CELL, "data-preview-part": "date", "data-today": "true" },
    );
    expect(partsAt(day)).toEqual(["today", "date", "cell", "grid"]);
    const weekNumber = element({ "data-preview-grid": "" }, { class: CELL, "data-preview-part": "weekNumber" });
    expect(partsAt(weekNumber)).toEqual(["weekNumber", "grid"]);
    expect(partsAt(element({ "data-preview-grid": "" }))).toEqual(["grid"]);
  });

  it("names a hidden outside day by its blank", () => {
    const blank = element({ "data-preview-grid": "" }, { "data-preview-part": "outside" });
    expect(partsAt(blank)).toEqual(["outside", "grid"]);
  });

  it("names nothing outside every part", () => {
    expect(partsAt(element({}))).toEqual([]);
  });
});
