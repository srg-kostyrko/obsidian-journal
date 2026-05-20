import { localMoment } from "./calendar";

type ShiftUnit = "y" | "q" | "m" | "w" | "d" | "h";
type BoundaryUnit = "year" | "quarter" | "month" | "week" | "day" | "hour";

// moment uses uppercase "M"/"Q"; map from domain shorthand
const SHIFT_UNIT_MAP = { y: "y", q: "Q", m: "M", w: "w", d: "d", h: "h" } as const;

export class Clock {
  readonly kind = "Clock" as const;
  readonly #moment: ReturnType<typeof localMoment>;

  private constructor(m: ReturnType<typeof localMoment>) {
    this.#moment = m;
  }

  static now(): Clock {
    return new Clock(localMoment());
  }

  static msUntilNextLocalMidnight(): number {
    const now = localMoment();
    const nextMidnight = now.clone().startOf("day").add(1, "day");
    return nextMidnight.diff(now);
  }

  format(pattern: string): string {
    return this.#moment.format(pattern);
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
