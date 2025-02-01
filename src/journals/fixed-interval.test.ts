import { describe, it, expect } from "vitest";
import { FixedIntervalResolver } from "./fixed-interval";
import { computed } from "vue";
import { JournalAnchorDate } from "@/types/journal.types";
import { today } from "@/calendar";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";
import type { JournalCommand } from "@/types/settings.types";

describe("FixedIntervalResolver", () => {
  describe("daily journal", () => {
    const resolver = new FixedIntervalResolver(computed(() => ({ type: "day" })));

    it("return day as duration", () => {
      expect(resolver.duration).toBe("day");
    });

    it("returns null for invalid date", () => {
      expect(resolver.resolveForDate("2025-21-01")).toBe(null);
      expect(resolver.resolveNext("2025-21-01")).toBe(null);
      expect(resolver.resolvePrevious("2025-21-01")).toBe(null);
    });

    it("returns same date as anchor", () => {
      expect(resolver.resolveForDate("2025-01-01")).toBe("2025-01-01");
    });

    it("should return next day when resolving next interval", () => {
      expect(resolver.resolveNext("2025-01-01")).toBe("2025-01-02");
    });

    it("should return previous day when resolving for previous interval", () => {
      expect(resolver.resolvePrevious("2025-01-01")).toBe("2024-12-31");
    });

    it("should resolve same date when resolving start date", () => {
      expect(resolver.resolveStartDate(JournalAnchorDate("2025-01-01"))).toBe("2025-01-01");
    });

    it("should resolve same date when resolving end date", () => {
      expect(resolver.resolveEndDate(JournalAnchorDate("2025-01-01"))).toBe("2025-01-01");
    });

    describe("relative date", () => {
      it.each([
        [today().format(FRONTMATTER_DATE_FORMAT), "Today"],
        [today().add(1, "day").format(FRONTMATTER_DATE_FORMAT), "Tomorrow"],
        [today().subtract(1, "day").format(FRONTMATTER_DATE_FORMAT), "Yesterday"],
        [today().add(2, "day").format(FRONTMATTER_DATE_FORMAT), today().add(2, "day").format("dddd")],
        [today().subtract(3, "day").format(FRONTMATTER_DATE_FORMAT), today().subtract(3, "day").format("[Last] dddd")],
        [today().add(1, "week").format(FRONTMATTER_DATE_FORMAT), "in 7 days"],
        [today().subtract(1, "week").format(FRONTMATTER_DATE_FORMAT), "7 days ago"],
      ])(`should resolve %s to %s`, (date, expected) => {
        expect(resolver.resolveRelativeDate(JournalAnchorDate(date))).toBe(expected);
      });
    });

    describe("resolve for command", () => {
      it.each([
        ["same", "2025-01-03", "2025-01-03"],
        ["next", "2025-01-03", "2025-01-04"],
        ["previous", "2025-01-03", "2025-01-02"],
        ["same_next_week", "2025-01-03", "2025-01-10"],
        ["same_previous_week", "2025-01-03", "2024-12-27"],
        ["same_next_month", "2025-01-03", "2025-02-03"],
        ["same_previous_month", "2025-01-03", "2024-12-03"],
        ["same_next_year", "2025-01-03", "2026-01-03"],
        ["same_previous_year", "2025-01-03", "2024-01-03"],
      ])("should resolve %s for %s to %s", (command, date, expected) => {
        expect(resolver.resolveDateForCommand(date, command as JournalCommand["type"])).toBe(expected);
      });
    });

    it.each([
      ["2025-01-01", "2025-01-01", 0],
      ["2025-01-01", "2025-01-02", 1],
      ["2025-01-02", "2025-01-01", 1],
      ["2025-01-01", "2025-01-03", 2],
      ["2025-01-28", "2025-02-03", 6],
    ])("should count amount of days between %s and %s as %s", (startDate, endDate, expected) => {
      expect(resolver.countRepeats(startDate, endDate)).toBe(expected);
    });

    it("should return 0 offset", () => {
      expect(resolver.calculateOffset("2025-01-03")).toEqual([0, 0]);
    });
  });

  describe("weekly journal", () => {
    const resolver = new FixedIntervalResolver(computed(() => ({ type: "week" })));

    it("returns week as duration", () => {
      expect(resolver.duration).toBe("week");
    });

    it("returns null for invalid date", () => {
      expect(resolver.resolveForDate("2025-21-01")).toBe(null);
      expect(resolver.resolveNext("2025-21-01")).toBe(null);
      expect(resolver.resolvePrevious("2025-21-01")).toBe(null);
    });

    it("returns first day of week as anchor for weeks in middle of the year", () => {
      expect(resolver.resolveForDate("2025-01-07")).toBe("2025-01-05");
    });
    it("returns first day of week if week is at year break and belongs to year before", () => {
      expect(resolver.resolveForDate("2025-01-02")).toBe("2024-12-29");
    });
    it("returns last day of week if week is at year break and belongs to next year", () => {
      expect(resolver.resolveForDate("2024-01-02")).toBe("2024-01-06");
    });

    it("should return first day of next week when resolving next interval", () => {
      expect(resolver.resolveNext("2025-01-07")).toBe("2025-01-12");
    });

    it("should return first day of last week when resolving for previous interval", () => {
      expect(resolver.resolvePrevious("2025-01-14")).toBe("2025-01-05");
    });

    it("should resolve to first day of week when resolving start date", () => {
      expect(resolver.resolveStartDate(JournalAnchorDate("2025-01-11"))).toBe("2025-01-05");
    });

    it("should resolve to last day of week when resolving end date", () => {
      expect(resolver.resolveEndDate(JournalAnchorDate("2025-01-10"))).toBe("2025-01-11");
    });

    describe("relative date", () => {
      it.each([
        [today().startOf("week").format(FRONTMATTER_DATE_FORMAT), "This week"],
        [today().startOf("week").add(1, "week").format(FRONTMATTER_DATE_FORMAT), "Next week"],
        [today().startOf("week").subtract(1, "week").format(FRONTMATTER_DATE_FORMAT), "Last week"],
        [today().startOf("week").add(2, "week").format(FRONTMATTER_DATE_FORMAT), "2 weeks from now"],
        [today().startOf("week").subtract(2, "week").format(FRONTMATTER_DATE_FORMAT), "2 weeks ago"],
      ])(`should resolve %s to %s`, (date, expected) => {
        expect(resolver.resolveRelativeDate(JournalAnchorDate(date))).toBe(expected);
      });
    });

    describe("resolve for command", () => {
      it.each([
        ["same", "2025-01-03", "2025-01-03"],
        ["next", "2025-01-07", "2025-01-14"],
        ["previous", "2025-01-07", "2024-12-31"],
        ["same_next_week", "2025-01-03", "2025-01-10"],
        ["same_previous_week", "2025-01-03", "2024-12-27"],
        ["same_next_month", "2025-01-03", "2025-02-03"],
        ["same_previous_month", "2025-01-03", "2024-12-03"],
        ["same_next_year", "2025-01-03", "2026-01-03"],
        ["same_previous_year", "2025-01-03", "2024-01-03"],
      ])("should resolve %s for %s to %s", (command, date, expected) => {
        expect(resolver.resolveDateForCommand(date, command as JournalCommand["type"])).toBe(expected);
      });
    });

    it.each([
      ["2025-01-10", "2025-01-10", 0],
      ["2025-01-10", "2025-01-20", 1],
      ["2025-01-20", "2025-01-10", 1],
      ["2025-01-10", "2025-02-03", 3],
    ])("should count amount of weeks between %s and %s as %s", (startDate, endDate, expected) => {
      expect(resolver.countRepeats(startDate, endDate)).toBe(expected);
    });

    it("should return day offset from start and end of month", () => {
      expect(resolver.calculateOffset("2025-01-07")).toEqual([2, -4]);
    });
  });

  describe("monthly journal", () => {
    const resolver = new FixedIntervalResolver(computed(() => ({ type: "month" })));

    it("returns month as duration", () => {
      expect(resolver.duration).toBe("month");
    });

    it("returns null for invalid date", () => {
      expect(resolver.resolveForDate("2025-21-01")).toBe(null);
      expect(resolver.resolveNext("2025-21-01")).toBe(null);
      expect(resolver.resolvePrevious("2025-21-01")).toBe(null);
    });

    it("returns first day of month as anchor", () => {
      expect(resolver.resolveForDate("2025-01-15")).toBe("2025-01-01");
    });

    it("should return first day of next month when resolving next interval", () => {
      expect(resolver.resolveNext("2025-01-15")).toBe("2025-02-01");
    });

    it("should return first day of last month when resolving for previous interval", () => {
      expect(resolver.resolvePrevious("2025-01-11")).toBe("2024-12-01");
    });

    it("should resolve to first day of month when resolving start date", () => {
      expect(resolver.resolveStartDate(JournalAnchorDate("2025-01-11"))).toBe("2025-01-01");
    });

    it("should resolve to last day of month when resolving end date", () => {
      expect(resolver.resolveEndDate(JournalAnchorDate("2025-01-01"))).toBe("2025-01-31");
    });

    describe("relative date", () => {
      it.each([
        [today().startOf("month").format(FRONTMATTER_DATE_FORMAT), "This month"],
        [today().startOf("month").add(1, "month").format(FRONTMATTER_DATE_FORMAT), "Next month"],
        [today().startOf("month").subtract(1, "month").format(FRONTMATTER_DATE_FORMAT), "Last month"],
        [today().startOf("month").add(2, "month").format(FRONTMATTER_DATE_FORMAT), "2 months from now"],
        [today().startOf("month").subtract(2, "month").format(FRONTMATTER_DATE_FORMAT), "2 months ago"],
      ])(`should resolve %s to %s`, (date, expected) => {
        expect(resolver.resolveRelativeDate(JournalAnchorDate(date))).toBe(expected);
      });
    });

    describe("resolve for command", () => {
      it.each([
        ["same", "2025-01-03", "2025-01-03"],
        ["next", "2025-01-03", "2025-02-03"],
        ["previous", "2025-01-03", "2024-12-03"],
        ["same_next_week", "2025-01-03", "2025-01-10"],
        ["same_previous_week", "2025-01-03", "2024-12-27"],
        ["same_next_month", "2025-01-03", "2025-02-03"],
        ["same_previous_month", "2025-01-03", "2024-12-03"],
        ["same_next_year", "2025-01-03", "2026-01-03"],
        ["same_previous_year", "2025-01-03", "2024-01-03"],
      ])("should resolve %s for %s to %s", (command, date, expected) => {
        expect(resolver.resolveDateForCommand(date, command as JournalCommand["type"])).toBe(expected);
      });
    });

    it.each([
      ["2025-01-01", "2025-01-01", 0],
      ["2025-01-01", "2025-02-02", 1],
      ["2025-02-02", "2025-01-01", 1],
      ["2025-01-01", "2025-03-03", 2],
    ])("should count amount of days between %s and %s as %s", (startDate, endDate, expected) => {
      expect(resolver.countRepeats(startDate, endDate)).toBe(expected);
    });

    it("should return day offset from start and end of month", () => {
      expect(resolver.calculateOffset("2025-01-03")).toEqual([2, -28]);
    });
  });

  describe("quarterly journal", () => {
    const resolver = new FixedIntervalResolver(computed(() => ({ type: "quarter" })));

    it("returns quarter as duration", () => {
      expect(resolver.duration).toBe("quarter");
    });

    it("returns null for invalid date", () => {
      expect(resolver.resolveForDate("2025-21-01")).toBe(null);
      expect(resolver.resolveNext("2025-21-01")).toBe(null);
      expect(resolver.resolvePrevious("2025-21-01")).toBe(null);
    });

    it("returns first day of quarter as anchor", () => {
      expect(resolver.resolveForDate("2025-02-15")).toBe("2025-01-01");
    });

    it("should return first day of next quarter when resolving next interval", () => {
      expect(resolver.resolveNext("2025-01-15")).toBe("2025-04-01");
    });

    it("should return first day of last quarter when resolving for previous interval", () => {
      expect(resolver.resolvePrevious("2025-01-11")).toBe("2024-10-01");
    });

    it("should resolve to first day of quarter when resolving start date", () => {
      expect(resolver.resolveStartDate(JournalAnchorDate("2025-02-11"))).toBe("2025-01-01");
    });

    it("should resolve to last day of quarter when resolving end date", () => {
      expect(resolver.resolveEndDate(JournalAnchorDate("2025-02-01"))).toBe("2025-03-31");
    });

    describe("relative date", () => {
      it.each([
        [today().startOf("quarter").format(FRONTMATTER_DATE_FORMAT), "This quarter"],
        [today().startOf("quarter").add(1, "quarter").format(FRONTMATTER_DATE_FORMAT), "Next quarter"],
        [today().startOf("quarter").subtract(1, "quarter").format(FRONTMATTER_DATE_FORMAT), "Last quarter"],
        [today().startOf("quarter").add(2, "quarter").format(FRONTMATTER_DATE_FORMAT), "2 quarters from now"],
        [today().startOf("quarter").subtract(2, "quarter").format(FRONTMATTER_DATE_FORMAT), "2 quarters ago"],
      ])(`should resolve %s to %s`, (date, expected) => {
        expect(resolver.resolveRelativeDate(JournalAnchorDate(date))).toBe(expected);
      });
    });

    describe("resolve for command", () => {
      it.each([
        ["same", "2025-01-03", "2025-01-03"],
        ["next", "2025-01-03", "2025-04-03"],
        ["previous", "2025-01-03", "2024-10-03"],
        ["same_next_week", "2025-01-03", "2025-01-10"],
        ["same_previous_week", "2025-01-03", "2024-12-27"],
        ["same_next_month", "2025-01-03", "2025-02-03"],
        ["same_previous_month", "2025-01-03", "2024-12-03"],
        ["same_next_year", "2025-01-03", "2026-01-03"],
        ["same_previous_year", "2025-01-03", "2024-01-03"],
      ])("should resolve %s for %s to %s", (command, date, expected) => {
        expect(resolver.resolveDateForCommand(date, command as JournalCommand["type"])).toBe(expected);
      });
    });

    it.each([
      ["2025-01-01", "2025-01-01", 0],
      ["2025-01-01", "2025-04-02", 1],
      ["2025-04-02", "2025-01-01", 1],
      ["2025-01-01", "2025-07-03", 2],
    ])("should count amount of quarters between %s and %s as %s", (startDate, endDate, expected) => {
      expect(resolver.countRepeats(startDate, endDate)).toBe(expected);
    });

    it("should return day offset from start and end of quarter", () => {
      expect(resolver.calculateOffset("2025-02-03")).toEqual([33, -56]);
    });
  });

  describe("annual journal", () => {
    const resolver = new FixedIntervalResolver(computed(() => ({ type: "year" })));

    it("returns year as duration", () => {
      expect(resolver.duration).toBe("year");
    });

    it("returns null for invalid date", () => {
      expect(resolver.resolveForDate("2025-21-01")).toBe(null);
      expect(resolver.resolveNext("2025-21-01")).toBe(null);
      expect(resolver.resolvePrevious("2025-21-01")).toBe(null);
    });

    it("returns first day of year as anchor", () => {
      expect(resolver.resolveForDate("2025-02-15")).toBe("2025-01-01");
    });

    it("should return first day of next year when resolving next interval", () => {
      expect(resolver.resolveNext("2025-01-15")).toBe("2026-01-01");
    });

    it("should return first day of last year when resolving for previous interval", () => {
      expect(resolver.resolvePrevious("2025-01-11")).toBe("2024-01-01");
    });

    it("should resolve to first day of year when resolving start date", () => {
      expect(resolver.resolveStartDate(JournalAnchorDate("2025-02-11"))).toBe("2025-01-01");
    });

    it("should resolve to last day of year when resolving end date", () => {
      expect(resolver.resolveEndDate(JournalAnchorDate("2025-02-01"))).toBe("2025-12-31");
    });

    describe("relative date", () => {
      it.each([
        [today().startOf("year").format(FRONTMATTER_DATE_FORMAT), "This year"],
        [today().startOf("year").add(1, "year").format(FRONTMATTER_DATE_FORMAT), "Next year"],
        [today().startOf("year").subtract(1, "year").format(FRONTMATTER_DATE_FORMAT), "Last year"],
        [today().startOf("year").add(2, "year").format(FRONTMATTER_DATE_FORMAT), "2 years from now"],
        [today().startOf("year").subtract(2, "year").format(FRONTMATTER_DATE_FORMAT), "2 years ago"],
      ])(`should resolve %s to %s`, (date, expected) => {
        expect(resolver.resolveRelativeDate(JournalAnchorDate(date))).toBe(expected);
      });
    });

    describe("resolve for command", () => {
      it.each([
        ["same", "2025-01-03", "2025-01-03"],
        ["next", "2025-01-03", "2026-01-03"],
        ["previous", "2025-01-03", "2024-01-03"],
        ["same_next_week", "2025-01-03", "2025-01-10"],
        ["same_previous_week", "2025-01-03", "2024-12-27"],
        ["same_next_month", "2025-01-03", "2025-02-03"],
        ["same_previous_month", "2025-01-03", "2024-12-03"],
        ["same_next_year", "2025-01-03", "2026-01-03"],
        ["same_previous_year", "2025-01-03", "2024-01-03"],
      ])("should resolve %s for %s to %s", (command, date, expected) => {
        expect(resolver.resolveDateForCommand(date, command as JournalCommand["type"])).toBe(expected);
      });
    });

    it.each([
      ["2025-01-01", "2025-01-01", 0],
      ["2025-01-01", "2026-04-02", 1],
      ["2026-04-02", "2025-01-01", 1],
      ["2025-01-01", "2027-07-03", 2],
    ])("should count amount of quarters between %s and %s as %s", (startDate, endDate, expected) => {
      expect(resolver.countRepeats(startDate, endDate)).toBe(expected);
    });

    it("should return day offset from start and end of quarter", () => {
      expect(resolver.calculateOffset("2025-02-03")).toEqual([33, -331]);
    });
  });
});
