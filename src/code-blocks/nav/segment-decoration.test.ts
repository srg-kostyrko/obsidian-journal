// cspell: ignore unshifted
import { describe, expect, it } from "vitest";

import { CalendarDate, periodOfKind, type AnchorString } from "@/calendar";
import { Option } from "@/infrastructure/result";
import type { JournalConfig, JournalEntry } from "@/journals";
import { buildNavSegment } from "@/journals/testing";
import type { ShelfConfig } from "@/shelves";

import { resolveSegmentDecoration, segmentDecorationCell } from "./segment-decoration";

const REF = "2025-08-15" as AnchorString;
const DATE = CalendarDate.fromAnchor(REF);
const SHIFTED = CalendarDate.fromAnchor("2024-08-15" as AnchorString);

function journal(name: string, type: JournalConfig["write"]["type"]): JournalConfig {
  return { name, write: { type } } as JournalConfig;
}

const daily = journal("daily", "day");
const workDaily = journal("work-daily", "day");
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
  "daily::2024-08-15": "2024-08-15",
  "work-daily::2025-08-15": "2025-08-15",
  "yearly::2025-08-15": "2025-01-01",
  "yearly::2024-08-15": "2024-01-01",
  "sprint::2025-08-15": "2025-08-11",
};

const anchorOf = (name: string, date: CalendarDate): Option<AnchorString> =>
  Option.fromNullable(ANCHORS[`${name}::${date.toAnchor()}`] as AnchorString | undefined);

describe("segmentDecorationCell", () => {
  it("decorates a self segment as the host period, drawing on the host alone when no shelf mate shares its write type", () => {
    const cell = segmentDecorationCell(
      buildNavSegment({ link: "self" }),
      daily,
      [daily],
      [],
      anchorOf,
      DATE,
      REF,
      false,
    );
    expect(cell).toEqual({
      period: dayPeriod("2025-08-15"),
      journalNames: ["daily"],
      scopeKind: "fixed",
      anchorJournalName: "daily",
    });
  });

  it("anchors a host-like segment to the host even when an earlier journal shares its write type", () => {
    const cycles = journal("cycles", "custom");
    const cell = segmentDecorationCell(
      buildNavSegment({ link: "self" }),
      sprint,
      [cycles, sprint],
      [],
      anchorOf,
      DATE,
      REF,
      false,
    );
    expect(cell?.anchorJournalName).toBe("sprint");
  });

  it("decorates an unshifted self segment from every same-write-type journal in scope, not just the host", () => {
    const cell = segmentDecorationCell(
      buildNavSegment({ link: "self" }),
      daily,
      [daily, workDaily],
      [],
      anchorOf,
      DATE,
      REF,
      false,
    );
    expect(cell?.journalNames.toSorted()).toEqual(["daily", "work-daily"]);
  });

  it("decorates an unlinked segment from every same-write-type journal in scope, at the host period", () => {
    const cell = segmentDecorationCell(
      buildNavSegment({ link: "none" }),
      daily,
      [daily, workDaily],
      [],
      anchorOf,
      DATE,
      REF,
      false,
    );
    expect(cell?.period).toEqual(dayPeriod("2025-08-15"));
    expect(cell?.journalNames.toSorted()).toEqual(["daily", "work-daily"]);
  });

  it("decorates a year-link segment from the year journals at the year period", () => {
    const cell = segmentDecorationCell(
      buildNavSegment({ link: "year" }),
      daily,
      [daily],
      [yearly],
      anchorOf,
      DATE,
      REF,
      false,
    );
    expect(cell).toEqual({
      period: yearPeriod("2025-01-01"),
      journalNames: ["yearly"],
      scopeKind: "fixed",
      anchorJournalName: "yearly",
    });
  });

  it("routes a custom-journal target into the interval scope", () => {
    const cell = segmentDecorationCell(
      buildNavSegment({ link: "journal", journal: "sprint" }),
      daily,
      [daily],
      [sprint],
      anchorOf,
      DATE,
      REF,
      false,
    );
    expect(cell?.scopeKind).toBe("interval");
  });

  it("decorates a shifted link segment at its shifted period", () => {
    const cell = segmentDecorationCell(
      buildNavSegment({ link: "year", linkDate: "-1y" }),
      daily,
      [daily],
      [yearly],
      anchorOf,
      SHIFTED,
      REF,
      true,
    );
    expect(cell?.period.anchor.toAnchor()).toBe("2024-01-01");
  });

  it("decorates a shifted self segment at its shifted period, not the unshifted host period", () => {
    const cell = segmentDecorationCell(
      buildNavSegment({ link: "self", linkDate: "-1y" }),
      daily,
      [daily, workDaily],
      [daily],
      anchorOf,
      SHIFTED,
      REF,
      true,
    );
    expect(cell).toEqual({
      period: dayPeriod("2024-08-15"),
      journalNames: ["daily"],
      scopeKind: "fixed",
      anchorJournalName: "daily",
    });
  });

  it("returns null when the target list is empty", () => {
    expect(
      segmentDecorationCell(buildNavSegment({ link: "year" }), daily, [daily], [], anchorOf, DATE, REF, false),
    ).toBeNull();
  });

  it("returns null when the target journal's own anchor lookup resolves to none", () => {
    const monthly = journal("monthly", "month");
    const cell = segmentDecorationCell(
      buildNavSegment({ link: "month" }),
      daily,
      [daily],
      [monthly],
      anchorOf,
      DATE,
      REF,
      false,
    );
    expect(cell).toBeNull();
  });
});

const cycle = { anchorOf };
const noEntry = Option.none<JournalEntry>();

describe("resolveSegmentDecoration", () => {
  it("decorates a year-link segment from the year journal in shelf scope, not the daily host", () => {
    const cell = resolveSegmentDecoration(
      buildNavSegment({ link: "year" }),
      daily,
      [daily, yearly],
      [{ name: "main", journals: ["daily", "yearly"], decorations: [] } satisfies ShelfConfig],
      noEntry,
      REF,
      cycle,
    );
    expect(cell).toEqual({
      period: yearPeriod("2025-01-01"),
      journalNames: ["yearly"],
      scopeKind: "fixed",
      anchorJournalName: "yearly",
    });
  });

  it("decorates an unshifted self segment from every same-write-type shelf mate", () => {
    const cell = resolveSegmentDecoration(
      buildNavSegment({ link: "self" }),
      daily,
      [daily, workDaily],
      [{ name: "main", journals: ["daily", "work-daily"], decorations: [] } satisfies ShelfConfig],
      noEntry,
      REF,
      cycle,
    );
    expect(cell?.journalNames.toSorted()).toEqual(["daily", "work-daily"]);
  });

  it("falls back to every journal when the host is on no shelf", () => {
    const cell = resolveSegmentDecoration(
      buildNavSegment({ link: "self" }),
      daily,
      [daily, workDaily],
      [],
      noEntry,
      REF,
      cycle,
    );
    expect(cell?.journalNames.toSorted()).toEqual(["daily", "work-daily"]);
  });

  it("decorates a shifted self segment at its shifted period", () => {
    const cell = resolveSegmentDecoration(
      buildNavSegment({ link: "self", linkDate: "-1y" }),
      daily,
      [daily, workDaily],
      [{ name: "main", journals: ["daily", "work-daily"], decorations: [] } satisfies ShelfConfig],
      noEntry,
      "2025-08-15" as AnchorString,
      cycle,
    );
    expect(cell).toEqual({
      period: dayPeriod("2024-08-15"),
      journalNames: ["daily"],
      scopeKind: "fixed",
      anchorJournalName: "daily",
    });
  });
});
