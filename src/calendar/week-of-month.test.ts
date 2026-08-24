import { describe, expect, it } from "vitest";

import { date, installTestCalendar } from "./testing";
import { weekOfMonth } from "./week-of-month";

describe("weekOfMonth", () => {
  it("counts the week holding the first of the month as week 1", () => {
    expect(weekOfMonth(date("2026-06-01"))).toBe(1);
  });

  it("counts a later week from the week holding the first", () => {
    expect(weekOfMonth(date("2026-06-17"))).toBe(3);
  });

  it("puts a month's opening days in week 1 when the month starts mid-week", () => {
    expect(weekOfMonth(date("2026-01-01"))).toBe(1);
  });

  it("starts week 2 on the first full week of a month that starts mid-week", () => {
    expect(weekOfMonth(date("2026-01-05"))).toBe(2);
  });

  it("keeps a trailing day in its own month's count", () => {
    expect(weekOfMonth(date("2026-01-31"))).toBe(5);
  });

  it("follows the configured week start", () => {
    installTestCalendar({ dow: 0, doy: 6 });

    expect(weekOfMonth(date("2026-08-30"))).toBe(6);
  });

  // The week-owned reading a template writes as {{week_of_month<endOf=week>}}: reading the
  // number off the week's last day moves the whole straddling week into the month it ends in.
  it("reads as week 1 of the next month when taken from the end of a straddling week", () => {
    installTestCalendar({ dow: 0, doy: 6 });

    expect(weekOfMonth(date("2026-08-30").endOf("week"))).toBe(1);
  });

  it("agrees across every day of a straddling week read from the week's end", () => {
    installTestCalendar({ dow: 0, doy: 6 });
    const week = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];

    const numbers = week.map((day) => weekOfMonth(date(day).endOf("week")));

    expect(numbers).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});
