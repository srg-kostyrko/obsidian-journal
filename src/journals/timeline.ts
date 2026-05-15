import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection } from "./config";
import { CycleService } from "./cycle";

import type { JournalConfig } from "./config";

export class TimelineService {
  readonly #settings = inject(SettingsService);
  readonly #cycle = inject(CycleService);

  contains(name: string, anchor: AnchorString): boolean {
    const config = this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
    if (!config) return false;
    if (anchor < config.timeline.start) return false;
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
    const config = this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
    return Option.fromNullable(config).map((c) => CalendarDate.fromAnchor(c.timeline.start));
  }

  endOf(name: string): Option<CalendarDate> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
    if (!config) return Option.none();
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
