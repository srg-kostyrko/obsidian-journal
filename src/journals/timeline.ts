import { match } from "ts-pattern";

import { CalendarDate, OpenInterval } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";

import { CycleService } from "./cycle";
import { JournalsRepository } from "./repository";

export class TimelineService {
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);

  // Widen to the whole period the start falls in: contains() admits a period that straddles the
  // start date, so a narrower bound would grey out a cell the journal accepts.
  #boundStart(name: string): Option<CalendarDate> {
    return this.startOf(name)
      .flatMap((d) => this.#cycle.anchorOf(name, d))
      .flatMap((a) => this.#cycle.startOf(name, a));
  }

  // Widen to the whole period the end falls in: contains() admits a period by its anchor, so a
  // period straddling the end date is still written and its cell must stay selectable.
  #boundEnd(name: string): Option<CalendarDate> {
    return this.endOf(name)
      .flatMap((d) => this.#cycle.anchorOf(name, d))
      .flatMap((a) => this.#cycle.endOf(name, a));
  }

  contains(name: string, anchor: AnchorString): boolean {
    const configOpt = this.#journals.get(name);
    if (configOpt.isNone()) return false;
    const config = configOpt.value;
    // Gate on the period's last day, not its anchor, so a period that straddles the start
    // date (e.g. a week whose anchor precedes a mid-week timeline start) stays in-timeline.
    const periodEnd = this.#cycle.endOf(name, anchor);
    if (periodEnd.isSome() && periodEnd.value.toAnchor() < config.timeline.start) return false;
    return (
      match(config.timeline.end)
        .with({ kind: "never" }, () => true)
        // An unset end date is no bound at all. Comparing against "" would sort every real
        // anchor above it and silently bound the journal to nothing.
        .with({ kind: "date" }, ({ date }) => date === "" || anchor <= date)
        // A repeats bound counts forward from the timeline start, so with no start there is
        // nothing to count from: the bound is un-countable and the journal stays unbounded
        // rather than writing nothing at all (v2 required a start for this bound too).
        .with({ kind: "repeats" }, ({ count }) => {
          if (config.timeline.start === "") return true;
          const repeats = this.#cycle.countRepeats(name, config.timeline.start, anchor);
          return repeats.isSome() && repeats.value < count;
        })
        .exhaustive()
    );
  }

  startOf(name: string): Option<CalendarDate> {
    return this.#journals
      .get(name)
      .flatMap((c) =>
        c.timeline.start === "" ? Option.none<CalendarDate>() : Option.some(CalendarDate.fromAnchor(c.timeline.start)),
      );
  }

  endOf(name: string): Option<CalendarDate> {
    const configOpt = this.#journals.get(name);
    if (configOpt.isNone()) return Option.none();
    const config = configOpt.value;
    return match(config.timeline.end)
      .with({ kind: "never" }, () => Option.none<CalendarDate>())
      .with({ kind: "date" }, ({ date }) =>
        date === "" ? Option.none<CalendarDate>() : Option.some(CalendarDate.fromAnchor(date)),
      )
      .with({ kind: "repeats" }, ({ count }) => {
        // Without a start there is nothing to count from, and CalendarDate.fromAnchor("")
        // would otherwise carry an invalid moment through as a garbage end date.
        if (config.timeline.start === "") return Option.none<CalendarDate>();
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

  boundsOf(name: string): OpenInterval {
    const start = this.#boundStart(name);
    const end = this.#boundEnd(name);
    if (start.isSome() && end.isSome()) {
      const between = OpenInterval.between(start.value, end.value);
      // Only hand-edited settings can put the start after the end. Keep the start bound rather
      // than dropping both and offering the whole calendar.
      return between.isOk() ? between.value : OpenInterval.from(start.value);
    }
    if (start.isSome()) return OpenInterval.from(start.value);
    if (end.isSome()) return OpenInterval.until(end.value);
    return OpenInterval.unbounded();
  }
}
