import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";

import { periodForJournal } from "./period-for-journal";

const anchor = "2026-05-27" as AnchorString;

describe("periodForJournal", () => {
  it("returns a DayPeriod for write.type === 'day'", () => {
    expect(periodForJournal({ type: "day" }, anchor).kind).toBe("day");
  });

  it("returns a WeekPeriod for write.type === 'week'", () => {
    expect(periodForJournal({ type: "week" }, anchor).kind).toBe("week");
  });

  it("returns a MonthPeriod for write.type === 'month'", () => {
    expect(periodForJournal({ type: "month" }, anchor).kind).toBe("month");
  });

  it("returns a QuarterPeriod for write.type === 'quarter'", () => {
    expect(periodForJournal({ type: "quarter" }, anchor).kind).toBe("quarter");
  });

  it("returns a YearPeriod for write.type === 'year'", () => {
    expect(periodForJournal({ type: "year" }, anchor).kind).toBe("year");
  });

  it("collapses custom writes to a DayPeriod", () => {
    expect(periodForJournal({ type: "custom", every: "week", duration: 2, anchorDate: anchor }, anchor).kind).toBe(
      "day",
    );
  });
});
