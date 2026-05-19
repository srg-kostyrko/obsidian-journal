import { localMoment } from "./calendar";

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
}
