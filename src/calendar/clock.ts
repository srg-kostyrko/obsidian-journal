// src/calendar/clock.ts
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

  format(pattern: string): string {
    return this.#moment.clone().format(pattern);
  }
}
