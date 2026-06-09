import { match } from "ts-pattern";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import { periodKinds, periodOfKind } from "./period";
import { date, installTestCalendar } from "./testing";

import type { Period, PeriodKind } from "./period";
import type { DayPeriod } from "./period-day";
import type { DecadePeriod } from "./period-decade";
import type { MonthPeriod } from "./period-month";
import type { QuarterPeriod } from "./period-quarter";
import type { WeekPeriod } from "./period-week";
import type { YearPeriod } from "./period-year";

describe("Period union", () => {
  it("kind discriminator narrows each variant to its subtype under ts-pattern", () => {
    const narrow = (period: Period): string =>
      match(period)
        .with({ kind: "day" }, (p) => {
          expectTypeOf(p).toEqualTypeOf<DayPeriod>();
          return "day";
        })
        .with({ kind: "week" }, (p) => {
          expectTypeOf(p).toEqualTypeOf<WeekPeriod>();
          return "week";
        })
        .with({ kind: "month" }, (p) => {
          expectTypeOf(p).toEqualTypeOf<MonthPeriod>();
          return "month";
        })
        .with({ kind: "quarter" }, (p) => {
          expectTypeOf(p).toEqualTypeOf<QuarterPeriod>();
          return "quarter";
        })
        .with({ kind: "year" }, (p) => {
          expectTypeOf(p).toEqualTypeOf<YearPeriod>();
          return "year";
        })
        .with({ kind: "decade" }, (p) => {
          expectTypeOf(p).toEqualTypeOf<DecadePeriod>();
          return "decade";
        })
        .exhaustive();

    expectTypeOf(narrow).toBeFunction();
  });

  it("PeriodKind covers exactly the six expected period kinds", () => {
    expectTypeOf<PeriodKind>().toEqualTypeOf<"day" | "week" | "month" | "quarter" | "year" | "decade">();
  });
});

describe("periodOfKind", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("returns a period tagged with the requested kind", () => {
    for (const kind of periodKinds) {
      expect(periodOfKind(kind, date("2025-03-14")).kind).toBe(kind);
    }
  });

  it("returns the period containing the given date", () => {
    expect(periodOfKind("month", date("2025-03-14")).start.toAnchor()).toBe("2025-03-01");
  });
});
