import { describe, expect, it } from "vitest";

import { bandPlacement, type BandRow } from "./band-placement";

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];
const SAT_SUN = new Set([6, 0]);
const row = (isCurrentWeek: boolean, hasDay = true): BandRow => ({ isCurrentWeek, hasDay });

const placement = (overrides: Partial<Parameters<typeof bandPlacement>[0]> = {}) =>
  bandPlacement({
    columns: MONDAY_FIRST,
    weekend: SAT_SUN,
    weekNumbersLeft: true,
    weekdayHeader: true,
    rows: [row(false), row(true), row(false)],
    ...overrides,
  });

describe("bandPlacement", () => {
  describe("weekend", () => {
    it("runs down each group of adjacent weekend columns, after left week numbers", () => {
      expect(placement().weekend).toEqual([{ key: "5", column: "7 / span 2" }]);
    });

    it("starts at the first column without left week numbers", () => {
      expect(placement({ weekNumbersLeft: false }).weekend).toEqual([{ key: "5", column: "6 / span 2" }]);
    });

    it("splits a Sunday-start weekend across both edges", () => {
      expect(placement({ columns: [0, 1, 2, 3, 4, 5, 6] }).weekend).toEqual([
        { key: "0", column: "2 / span 1" },
        { key: "6", column: "8 / span 1" },
      ]);
    });

    it("draws none for an empty weekend", () => {
      expect(placement({ weekend: new Set() }).weekend).toEqual([]);
    });
  });

  describe("current week", () => {
    it("crosses today's row, below a shown weekday header", () => {
      expect(placement()).toMatchObject({ currentWeekIndex: 1, currentWeekRow: "3 / span 1" });
    });

    it("counts no header row when the weekday header is hidden", () => {
      expect(placement({ weekdayHeader: false })).toMatchObject({ currentWeekIndex: 1, currentWeekRow: "2 / span 1" });
    });

    it("skips a row whose days are all blanks", () => {
      expect(placement({ rows: [row(false), row(true, false)] })).toMatchObject({
        currentWeekIndex: -1,
        currentWeekRow: undefined,
      });
    });

    it("draws none without today's week", () => {
      expect(placement({ rows: [row(false), row(false)] })).toMatchObject({
        currentWeekIndex: -1,
        currentWeekRow: undefined,
      });
    });
  });
});
