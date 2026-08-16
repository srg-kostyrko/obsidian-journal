import { describe, expect, it } from "vitest";

import { CalendarDate, periodOfKind, type AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Option } from "@/infrastructure/result";
import type { JournalConfig, NavBlockSegment } from "@/journals";

import { segmentDecorationCell } from "./segment-decoration";

installTestCalendar();

const REF = "2025-08-15" as AnchorString;
const DATE = CalendarDate.fromAnchor(REF);
const SHIFTED = CalendarDate.fromAnchor("2024-08-15" as AnchorString);

function segment(overrides: Partial<NavBlockSegment>): NavBlockSegment {
  return {
    template: "",
    fontSize: 1,
    bold: false,
    italic: false,
    link: "none",
    journal: "",
    linkDate: "",
    color: { type: "theme", name: "text-normal" },
    background: { type: "transparent" },
    addDecorations: false,
    ...overrides,
  };
}

function journal(name: string, type: JournalConfig["write"]["type"]): JournalConfig {
  return { name, write: { type } } as JournalConfig;
}

const daily = journal("daily", "day");
const yearly = journal("yearly", "year");
const sprint = journal("sprint", "custom");

function dayPeriod(anchor: string) {
  return periodOfKind("day", CalendarDate.fromAnchor(anchor as AnchorString));
}

function yearPeriod(anchor: string) {
  return periodOfKind("year", CalendarDate.fromAnchor(anchor as AnchorString));
}

const ANCHORS: Record<string, string> = {
  "daily::2025-08-15": "2025-08-15",
  "yearly::2025-08-15": "2025-01-01",
  "yearly::2024-08-15": "2024-01-01",
  "sprint::2025-08-15": "2025-08-11",
};

const anchorOf = (name: string, date: CalendarDate): Option<AnchorString> =>
  Option.fromNullable(ANCHORS[`${name}::${date.toAnchor()}`] as AnchorString | undefined);

describe("segmentDecorationCell", () => {
  it("decorates a self segment as the host journal's own period", () => {
    const cell = segmentDecorationCell(segment({ link: "self" }), daily, [], anchorOf, DATE, REF);
    expect(cell).toEqual({ period: dayPeriod("2025-08-15"), journalNames: ["daily"], scopeKind: "fixed" });
  });

  it("decorates an unlinked segment as the host journal's own period", () => {
    const cell = segmentDecorationCell(segment({ link: "none" }), daily, [], anchorOf, DATE, REF);
    expect(cell?.journalNames).toEqual(["daily"]);
  });

  it("decorates a year-link segment from the year journals at the year period", () => {
    const cell = segmentDecorationCell(segment({ link: "year" }), daily, [yearly], anchorOf, DATE, REF);
    expect(cell).toEqual({ period: yearPeriod("2025-01-01"), journalNames: ["yearly"], scopeKind: "fixed" });
  });

  it("routes a custom-journal target into the interval scope", () => {
    const cell = segmentDecorationCell(
      segment({ link: "journal", journal: "sprint" }),
      daily,
      [sprint],
      anchorOf,
      DATE,
      REF,
    );
    expect(cell?.scopeKind).toBe("interval");
  });

  it("decorates a shifted segment at its shifted period", () => {
    const cell = segmentDecorationCell(
      segment({ link: "year", linkDate: "-1y" }),
      daily,
      [yearly],
      anchorOf,
      SHIFTED,
      REF,
    );
    expect(cell?.period.anchor.toAnchor()).toBe("2024-01-01");
  });

  it("returns null when no target journal resolves an anchor", () => {
    expect(segmentDecorationCell(segment({ link: "year" }), daily, [], anchorOf, DATE, REF)).toBeNull();
  });
});
