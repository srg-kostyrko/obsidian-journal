import { moment } from "obsidian";
import type { ComputedRef } from "vue";
import type { IntervalResolver, JournalInterval } from "../types/journal.types";
import type { FixedWriteIntervals } from "../types/settings.types";
import { FRONTMATTER_DATE_FORMAT } from "../constants";
import type { MomentDate } from "../types/date.types";

// TODO: write tests
export class FixedInterval implements IntervalResolver {
  #settings: ComputedRef<FixedWriteIntervals>;

  constructor(settings: ComputedRef<FixedWriteIntervals>) {
    this.#settings = settings;
  }

  resolveForDate(date: string): JournalInterval | null {
    const baseDate = moment(date);
    if (!baseDate.isValid()) return null;
    return this.#buildInterval(baseDate);
  }

  resolveNext(date: string): JournalInterval | null {
    const baseDate = moment(date);
    if (!baseDate.isValid()) return null;
    baseDate.add(1, this.#settings.value.type);
    return this.#buildInterval(baseDate);
  }

  resolvePrevious(date: string): JournalInterval | null {
    const baseDate = moment(date);
    if (!baseDate.isValid()) return null;
    baseDate.subtract(1, this.#settings.value.type);
    return this.#buildInterval(baseDate);
  }

  #buildInterval(base: MomentDate): JournalInterval {
    const type = this.#settings.value.type;
    const start_date = base.startOf(type).format(FRONTMATTER_DATE_FORMAT);
    const end_date = base.endOf(type).format(FRONTMATTER_DATE_FORMAT);
    return {
      key: `${type}_${start_date}_${end_date}`,
      start_date,
      end_date,
    };
  }
}
