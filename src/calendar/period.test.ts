import { match } from "ts-pattern";
import { describe, expectTypeOf, it } from "vitest";

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
