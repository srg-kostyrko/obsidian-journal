import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";

import { CycleService } from "./cycle";
import { JournalsRepository } from "./repository";

export class TimelineService {
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);

  contains(name: string, anchor: AnchorString): boolean {
    const configOpt = this.#journals.get(name);
    if (configOpt.isNone()) return false;
    const config = configOpt.value;
    // Gate on the period's last day, not its anchor, so a period that straddles the start
    // date (e.g. a week whose anchor precedes a mid-week timeline start) stays in-timeline.
    const periodEnd = this.#cycle.endOf(name, anchor);
    if (periodEnd.isSome() && periodEnd.value.toAnchor() < config.timeline.start) return false;
    return match(config.timeline.end)
      .with({ kind: "never" }, () => true)
      .with({ kind: "date" }, ({ date }) => anchor <= date)
      .with({ kind: "repeats" }, ({ count }) => {
        const repeats = this.#cycle.countRepeats(name, config.timeline.start, anchor);
        return repeats.isSome() && repeats.value < count;
      })
      .exhaustive();
  }

  startOf(name: string): Option<CalendarDate> {
    return this.#journals.get(name).map((c) => CalendarDate.fromAnchor(c.timeline.start));
  }

  endOf(name: string): Option<CalendarDate> {
    const configOpt = this.#journals.get(name);
    if (configOpt.isNone()) return Option.none();
    const config = configOpt.value;
    return match(config.timeline.end)
      .with({ kind: "never" }, () => Option.none<CalendarDate>())
      .with({ kind: "date" }, ({ date }) => Option.some(CalendarDate.fromAnchor(date)))
      .with({ kind: "repeats" }, ({ count }) => {
        const startAnchorOpt = this.#cycle.anchorOf(name, CalendarDate.fromAnchor(config.timeline.start));
        if (startAnchorOpt.isNone()) return Option.none<CalendarDate>();
        let current = startAnchorOpt.value;
        for (let i = 1; i < count; i++) {
          const next = this.#cycle.nextAnchor(name, current);
          if (next.isNone()) return Option.none<CalendarDate>();
          current = next.value;
        }
        return this.#cycle.endOf(name, current);
      })
      .exhaustive();
  }
}
