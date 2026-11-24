import { Err, Ok, type Result } from "@/infrastructure/result";

import { localMoment } from "./calendar";
import { DateFormatError } from "./errors";

import type { PlainFormatPattern, UserDateFormat } from "./user-date-format";

type ShiftUnit = "y" | "q" | "m" | "w" | "d" | "h";
type BoundaryUnit = "year" | "quarter" | "month" | "week" | "day" | "hour";

// moment uses uppercase "M"/"Q"; map from domain shorthand
const SHIFT_UNIT_MAP = { y: "y", q: "Q", m: "M", w: "w", d: "d", h: "h" } as const;

export class Clock {
  static now(): Clock {
    return new Clock(localMoment());
  }

  static msUntilNextLocalMidnight(): number {
    const now = localMoment();
    const nextMidnight = now.clone().startOf("day").add(1, "day");
    return nextMidnight.diff(now);
  }

  readonly #moment: ReturnType<typeof localMoment>;

  readonly kind = "Clock" as const;

  private constructor(m: ReturnType<typeof localMoment>) {
    this.#moment = m;
  }

  format<P extends string>(pattern: PlainFormatPattern<P>): string {
    return this.#moment.format(pattern);
  }

  tryFormat(pattern: UserDateFormat): Result<string, DateFormatError> {
    try {
      return new Ok(this.#moment.format(pattern));
    } catch (error) {
      return new Err(new DateFormatError(pattern, error instanceof Error ? error.message : String(error)));
    }
  }

  shift(amount: number, unit: ShiftUnit): Clock {
    return new Clock(this.#moment.clone().add(amount, SHIFT_UNIT_MAP[unit]));
  }

  startOf(unit: BoundaryUnit): Clock {
    return new Clock(this.#moment.clone().startOf(unit));
  }

  endOf(unit: BoundaryUnit): Clock {
    return new Clock(this.#moment.clone().endOf(unit));
  }
}
