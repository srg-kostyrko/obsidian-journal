import { beforeEach, describe, expect, test } from "vitest";
import { deepCopy } from "../utils";
import { DEFAULT_CONFIG_INTERVAL } from "../config/config-defaults";
import { Interval, IntervalManager } from "./interval-manager";
import { CalendarHelper } from "../utils/calendar";

const expectInterval = (input: Interval, expected: { index: number; startDate: string; endDate: string }) => {
  expect(input.index).to.eq(expected.index);
  expect(input.startDate.format("YYYY-MM-DD")).to.eq(expected.startDate);
  expect(input.endDate.format("YYYY-MM-DD")).to.eq(expected.endDate);
};

describe("IntervalManager", () => {
  const calendar = new CalendarHelper({
    firstDayOfWeek: 1,
    firstWeekOfYear: 1,
  });

  describe("10 days increment", () => {
    let manager: IntervalManager;
    beforeEach(() => {
      manager = new IntervalManager(
        {
          ...deepCopy(DEFAULT_CONFIG_INTERVAL),
          numeration_type: "increment",
          start_index: 5,
          start_date: "2022-01-01",
          duration: 10,
          granularity: "day",
        },
        calendar,
      );
    });

    test.each([
      ["start interval for start date", "2022-01-01", { index: 5, startDate: "2022-01-01", endDate: "2022-01-10" }],
      [
        "start interval for date within start interval",
        "2022-01-03",
        { index: 5, startDate: "2022-01-01", endDate: "2022-01-10" },
      ],
      [
        "start interval for interval end date",
        "2022-01-10",
        { index: 5, startDate: "2022-01-01", endDate: "2022-01-10" },
      ],
      [
        "next interval after start interval",
        "2022-01-11",
        { index: 6, startDate: "2022-01-11", endDate: "2022-01-20" },
      ],
      [
        "next interval with date in middle of interval",
        "2022-01-15",
        { index: 6, startDate: "2022-01-11", endDate: "2022-01-20" },
      ],
      [
        "next interval for end date of interval",
        "2022-01-20",
        { index: 6, startDate: "2022-01-11", endDate: "2022-01-20" },
      ],
      [
        "prev interval before start interval",
        "2021-12-22",
        { index: 4, startDate: "2021-12-22", endDate: "2021-12-31" },
      ],
      [
        "prev interval with date in middle of interval",
        "2021-12-28",
        { index: 4, startDate: "2021-12-22", endDate: "2021-12-31" },
      ],
      [
        "prev interval for end date of interval",
        "2021-12-31",
        { index: 4, startDate: "2021-12-22", endDate: "2021-12-31" },
      ],
    ])("find %s", (_, date, interval) => {
      expectInterval(manager.findInterval(date), interval);
    });

    describe("using previously indexed intervals", () => {
      beforeEach(() => {
        manager.add({
          index: 2,
          startDate: calendar.date("2022-01-01"),
          endDate: calendar.date("2022-01-14"),
        });
      });

      test.each([
        ["interval from index by date", "2022-01-10", { index: 2, startDate: "2022-01-01", endDate: "2022-01-14" }],
        ["interval from index by date", "2022-01-16", { index: 3, startDate: "2022-01-15", endDate: "2022-01-24" }],
        ["prev interval based on indexed", "2021-12-29", { index: 1, startDate: "2021-12-22", endDate: "2021-12-31" }],
      ])("find %s", (_, date, interval) => {
        expectInterval(manager.findInterval(date), interval);
      });
    });
  });

  describe("weekly increment", () => {
    let manager: IntervalManager;
    beforeEach(() => {
      manager = new IntervalManager(
        {
          ...deepCopy(DEFAULT_CONFIG_INTERVAL),
          numeration_type: "increment",
          start_index: 5,
          start_date: "2022-01-01",
          duration: 1,
          granularity: "week",
        },
        calendar,
      );
    });

    test.each([
      ["start interval for start date", "2022-01-01", { index: 5, startDate: "2022-01-01", endDate: "2022-01-07" }],
      [
        "start interval for date within start interval",
        "2022-01-03",
        { index: 5, startDate: "2022-01-01", endDate: "2022-01-07" },
      ],
      [
        "start interval for interval end date",
        "2022-01-07",
        { index: 5, startDate: "2022-01-01", endDate: "2022-01-07" },
      ],
      [
        "next interval after start interval",
        "2022-01-08",
        { index: 6, startDate: "2022-01-08", endDate: "2022-01-14" },
      ],
      [
        "next interval with date in middle of interval",
        "2022-01-10",
        { index: 6, startDate: "2022-01-08", endDate: "2022-01-14" },
      ],
      [
        "next interval for end date of interval",
        "2022-01-14",
        { index: 6, startDate: "2022-01-08", endDate: "2022-01-14" },
      ],
      [
        "prev interval before start interval",
        "2021-12-25",
        { index: 4, startDate: "2021-12-25", endDate: "2021-12-31" },
      ],
      [
        "prev interval with date in middle of interval",
        "2021-12-28",
        { index: 4, startDate: "2021-12-25", endDate: "2021-12-31" },
      ],
      [
        "prev interval for end date of interval",
        "2021-12-31",
        { index: 4, startDate: "2021-12-25", endDate: "2021-12-31" },
      ],
    ])("find %s", (_, date, interval) => {
      expectInterval(manager.findInterval(date), interval);
    });

    describe("using previously indexed intervals", () => {
      beforeEach(() => {
        manager.add({
          index: 2,
          startDate: calendar.date("2022-01-01"),
          endDate: calendar.date("2022-01-14"),
        });
      });

      test.each([
        ["interval from index by date", "2022-01-10", { index: 2, startDate: "2022-01-01", endDate: "2022-01-14" }],
        ["interval from index by date", "2022-01-16", { index: 3, startDate: "2022-01-15", endDate: "2022-01-21" }],
        ["prev interval based on indexed", "2021-12-29", { index: 1, startDate: "2021-12-25", endDate: "2021-12-31" }],
      ])("find %s", (_, date, interval) => {
        expectInterval(manager.findInterval(date), interval);
      });
    });
  });

  describe("biweekly increment", () => {
    let manager: IntervalManager;
    beforeEach(() => {
      manager = new IntervalManager(
        {
          ...deepCopy(DEFAULT_CONFIG_INTERVAL),
          numeration_type: "increment",
          start_index: 5,
          start_date: "2022-01-01",
          duration: 2,
          granularity: "week",
        },
        calendar,
      );
    });

    test.each([
      ["start interval for start date", "2022-01-01", { index: 5, startDate: "2022-01-01", endDate: "2022-01-14" }],
      [
        "start interval for date within start interval",
        "2022-01-03",
        { index: 5, startDate: "2022-01-01", endDate: "2022-01-14" },
      ],
      [
        "start interval for interval end date",
        "2022-01-07",
        { index: 5, startDate: "2022-01-01", endDate: "2022-01-14" },
      ],
      [
        "next interval after start interval",
        "2022-01-15",
        { index: 6, startDate: "2022-01-15", endDate: "2022-01-28" },
      ],
      [
        "next interval with date in middle of interval",
        "2022-01-20",
        { index: 6, startDate: "2022-01-15", endDate: "2022-01-28" },
      ],
      [
        "next interval for end date of interval",
        "2022-01-28",
        { index: 6, startDate: "2022-01-15", endDate: "2022-01-28" },
      ],
      [
        "prev interval before start interval",
        "2021-12-18",
        { index: 4, startDate: "2021-12-18", endDate: "2021-12-31" },
      ],
      [
        "prev interval with date in middle of interval",
        "2021-12-28",
        { index: 4, startDate: "2021-12-18", endDate: "2021-12-31" },
      ],
      [
        "prev interval for end date of interval",
        "2021-12-31",
        { index: 4, startDate: "2021-12-18", endDate: "2021-12-31" },
      ],
    ])("find %s", (_, date, interval) => {
      expectInterval(manager.findInterval(date), interval);
    });

    describe("using previously indexed intervals", () => {
      beforeEach(() => {
        manager.add({
          index: 2,
          startDate: calendar.date("2022-01-01"),
          endDate: calendar.date("2022-01-21"),
        });
      });

      test.each([
        ["interval from index by date", "2022-01-10", { index: 2, startDate: "2022-01-01", endDate: "2022-01-21" }],
        ["interval from index by date", "2022-01-25", { index: 3, startDate: "2022-01-22", endDate: "2022-02-04" }],
        ["prev interval based on indexed", "2021-12-29", { index: 1, startDate: "2021-12-18", endDate: "2021-12-31" }],
      ])("find %s", (_, date, interval) => {
        expectInterval(manager.findInterval(date), interval);
      });
    });
  });

  describe("monthly increment", () => {
    let manager: IntervalManager;
    beforeEach(() => {
      manager = new IntervalManager(
        {
          ...deepCopy(DEFAULT_CONFIG_INTERVAL),
          numeration_type: "increment",
          start_index: 5,
          start_date: "2022-01-01",
          duration: 1,
          granularity: "month",
        },
        calendar,
      );
    });

    test.each([
      ["start interval for start date", "2022-01-01", { index: 5, startDate: "2022-01-01", endDate: "2022-01-31" }],
      [
        "start interval for date within start interval",
        "2022-01-03",
        { index: 5, startDate: "2022-01-01", endDate: "2022-01-31" },
      ],
      [
        "start interval for interval end date",
        "2022-01-31",
        { index: 5, startDate: "2022-01-01", endDate: "2022-01-31" },
      ],
      [
        "next interval after start interval",
        "2022-02-01",
        { index: 6, startDate: "2022-02-01", endDate: "2022-02-28" },
      ],
      [
        "next interval with date in middle of interval",
        "2022-02-10",
        { index: 6, startDate: "2022-02-01", endDate: "2022-02-28" },
      ],
      [
        "next interval for end date of interval",
        "2022-02-28",
        { index: 6, startDate: "2022-02-01", endDate: "2022-02-28" },
      ],
      [
        "prev interval before start interval",
        "2021-12-01",
        { index: 4, startDate: "2021-12-01", endDate: "2021-12-31" },
      ],
      [
        "prev interval with date in middle of interval",
        "2021-12-28",
        { index: 4, startDate: "2021-12-01", endDate: "2021-12-31" },
      ],
      [
        "prev interval for end date of interval",
        "2021-12-31",
        { index: 4, startDate: "2021-12-01", endDate: "2021-12-31" },
      ],
    ])("find %s", (_, date, interval) => {
      expectInterval(manager.findInterval(date), interval);
    });

    describe("using previously indexed intervals", () => {
      beforeEach(() => {
        manager.add({
          index: 2,
          startDate: calendar.date("2022-01-01"),
          endDate: calendar.date("2022-01-14"),
        });
      });

      test.each([
        ["interval from index by date", "2022-01-10", { index: 2, startDate: "2022-01-01", endDate: "2022-01-14" }],
        ["interval from index by date", "2022-01-16", { index: 3, startDate: "2022-01-15", endDate: "2022-02-14" }],
        ["prev interval based on indexed", "2021-12-29", { index: 1, startDate: "2021-12-01", endDate: "2021-12-31" }],
      ])("find %s", (_, date, interval) => {
        expectInterval(manager.findInterval(date), interval);
      });
    });
  });

  describe("quarter (year reset)", () => {
    let manager: IntervalManager;
    beforeEach(() => {
      manager = new IntervalManager(
        {
          ...deepCopy(DEFAULT_CONFIG_INTERVAL),
          numeration_type: "year",
          start_index: 4,
          start_date: "2023-11-01",
          duration: 3,
          granularity: "month",
        },
        calendar,
      );
    });

    test.each([
      ["start interval for start date", "2023-11-01", { index: 4, startDate: "2023-11-01", endDate: "2024-01-31" }],
      [
        "start interval for date within start interval",
        "2023-12-01",
        { index: 4, startDate: "2023-11-01", endDate: "2024-01-31" },
      ],
      [
        "start interval for interval end date",
        "2024-01-31",
        { index: 4, startDate: "2023-11-01", endDate: "2024-01-31" },
      ],
      [
        "next interval after start interval",
        "2024-03-01",
        { index: 1, startDate: "2024-02-01", endDate: "2024-04-30" },
      ],
      [
        "next interval with date in middle of interval",
        "2024-05-10",
        { index: 2, startDate: "2024-05-01", endDate: "2024-07-31" },
      ],
      [
        "next interval for end date of interval",
        "2024-04-30",
        { index: 1, startDate: "2024-02-01", endDate: "2024-04-30" },
      ],
      [
        "prev interval before start interval",
        "2023-08-01",
        { index: 3, startDate: "2023-08-01", endDate: "2023-10-31" },
      ],
      [
        "prev interval with date in middle of interval",
        "2023-09-01",
        { index: 3, startDate: "2023-08-01", endDate: "2023-10-31" },
      ],
      [
        "prev interval for end date of interval",
        "2023-10-31",
        { index: 3, startDate: "2023-08-01", endDate: "2023-10-31" },
      ],
      [
        "interval in next year with index reset",
        "2025-03-01",
        { index: 1, startDate: "2025-02-01", endDate: "2025-04-30" },
      ],
      [
        "interval in prev year with index reset",
        "2022-01-01",
        { index: 4, startDate: "2021-11-01", endDate: "2022-01-31" },
      ],
    ])("find %s", (_, date, interval) => {
      expectInterval(manager.findInterval(date), interval);
    });

    describe("using previously indexed intervals", () => {
      beforeEach(() => {
        manager.add({
          index: 2,
          startDate: calendar.date("2022-05-01"),
          endDate: calendar.date("2022-05-31"),
        });
      });

      test.each([
        ["indexed interval", "2022-05-12", { index: 2, startDate: "2022-05-01", endDate: "2022-05-31" }],
        ["next interval based on indexed", "2022-06-15", { index: 3, startDate: "2022-06-01", endDate: "2022-08-31" }],
        ["prev interval based on indexed", "2022-04-15", { index: 1, startDate: "2022-02-01", endDate: "2022-04-30" }],
      ])("find %s", (_, date, interval) => {
        expectInterval(manager.findInterval(date), interval);
      });
    });
  });
});
