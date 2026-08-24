import { match } from "ts-pattern";
import { describe, expect, expectTypeOf, it } from "vitest";

import { advance, periodKinds, periodOfKind, window } from "./period";
import { date } from "./testing";

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
  it("returns a period tagged with the requested kind", () => {
    for (const kind of periodKinds) {
      expect(periodOfKind(kind, date("2025-03-14")).kind).toBe(kind);
    }
  });

  it("returns the period containing the given date", () => {
    expect(periodOfKind("month", date("2025-03-14")).start.toAnchor()).toBe("2025-03-01");
  });
});

describe("advance", () => {
  it("returns the same period for zero steps", () => {
    const start = periodOfKind("month", date("2025-03-14"));
    expect(advance(start, 0).start.toAnchor()).toBe("2025-03-01");
  });

  it("steps forward for positive steps", () => {
    const start = periodOfKind("month", date("2025-03-14"));
    expect(advance(start, 2).start.toAnchor()).toBe("2025-05-01");
  });

  it("steps backward for negative steps", () => {
    const start = periodOfKind("month", date("2025-03-14"));
    expect(advance(start, -2).start.toAnchor()).toBe("2025-01-01");
  });
});

describe("window", () => {
  it("returns before + after + 1 periods", () => {
    const focus = periodOfKind("month", date("2025-03-14"));
    expect(window(focus, 2, 1)).toHaveLength(4);
  });

  it("places the focus at index `before`", () => {
    const focus = periodOfKind("month", date("2025-03-14"));
    expect(window(focus, 2, 1)[2].start.toAnchor()).toBe("2025-03-01");
  });

  it("spans from `before` prior to `after` after, in order", () => {
    const focus = periodOfKind("month", date("2025-03-14"));
    expect(window(focus, 2, 1).map((p) => p.start.toAnchor())).toEqual([
      "2025-01-01",
      "2025-02-01",
      "2025-03-01",
      "2025-04-01",
    ]);
  });

  it("returns just the focus for a zero window", () => {
    const focus = periodOfKind("month", date("2025-03-14"));
    expect(window(focus, 0, 0).map((p) => p.start.toAnchor())).toEqual(["2025-03-01"]);
  });
});
