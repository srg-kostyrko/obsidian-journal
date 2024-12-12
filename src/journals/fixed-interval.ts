import type { ComputedRef } from "vue";
import { JournalAnchorDate, type AnchorDateResolver } from "../types/journal.types";
import type { FixedWriteIntervals, JournalCommand } from "../types/settings.types";
import { FRONTMATTER_DATE_FORMAT } from "../constants";
import type { MomentDate } from "../types/date.types";
import { date_from_string, relativeDate } from "../calendar";

// TODO: write tests
export class FixedIntervalResolver implements AnchorDateResolver {
  #settings: ComputedRef<FixedWriteIntervals>;

  constructor(settings: ComputedRef<FixedWriteIntervals>) {
    this.#settings = settings;
  }
  resolveStartDate(anchorDate: JournalAnchorDate): string {
    const type = this.#settings.value.type;
    const start_date = date_from_string(anchorDate).startOf(type).format(FRONTMATTER_DATE_FORMAT);
    return start_date;
  }
  resolveEndDate(anchorDate: JournalAnchorDate): string {
    const type = this.#settings.value.type;
    const end_date = date_from_string(anchorDate).endOf(type).format(FRONTMATTER_DATE_FORMAT);
    return end_date;
  }

  resolveRelativeDate(anchorDate: JournalAnchorDate): string {
    const type = this.#settings.value.type;
    return relativeDate(type, anchorDate);
  }

  resolveForDate(date: string): JournalAnchorDate | null {
    const baseDate = date_from_string(date);
    if (!baseDate.isValid()) return null;
    return this.#resolveAnchorDate(baseDate);
  }

  resolveNext(date: string): JournalAnchorDate | null {
    const baseDate = date_from_string(date);
    if (!baseDate.isValid()) return null;
    baseDate.add(1, this.#settings.value.type);
    return this.#resolveAnchorDate(baseDate);
  }

  resolvePrevious(date: string): JournalAnchorDate | null {
    const baseDate = date_from_string(date);
    if (!baseDate.isValid()) return null;
    baseDate.subtract(1, this.#settings.value.type);
    return this.#resolveAnchorDate(baseDate);
  }

  resolveDateForCommand(date: string, command: JournalCommand["type"]): string | null {
    switch (command) {
      case "same": {
        return date;
      }
      case "next": {
        return date_from_string(date).add(1, this.#settings.value.type).format(FRONTMATTER_DATE_FORMAT);
      }
      case "previous": {
        return date_from_string(date).subtract(1, this.#settings.value.type).format(FRONTMATTER_DATE_FORMAT);
      }
      case "same_next_week": {
        return date_from_string(date).add(1, "week").format(FRONTMATTER_DATE_FORMAT);
      }
      case "same_previous_week": {
        return date_from_string(date).subtract(1, "week").format(FRONTMATTER_DATE_FORMAT);
      }
      case "same_next_month": {
        return date_from_string(date).add(1, "month").format(FRONTMATTER_DATE_FORMAT);
      }
      case "same_previous_month": {
        return date_from_string(date).subtract(1, "month").format(FRONTMATTER_DATE_FORMAT);
      }
      case "same_next_year": {
        return date_from_string(date).add(1, "year").format(FRONTMATTER_DATE_FORMAT);
      }
      case "same_previous_year": {
        return date_from_string(date).subtract(1, "year").format(FRONTMATTER_DATE_FORMAT);
      }
    }
    return null;
  }

  countRepeats(startDate: string, endDate: string): number {
    const start = date_from_string(startDate);
    const end = date_from_string(endDate);
    return Math.ceil(start.diff(end, this.#settings.value.type));
  }

  calculateOffset(date: string): [positive: number, negative: number] {
    const parsed = date_from_string(date);
    const anchorDate = this.#resolveAnchorDate(parsed);
    if (!anchorDate) return [0, 0];
    const start = date_from_string(anchorDate).startOf(this.#settings.value.type);
    const end = start.clone().endOf(this.#settings.value.type);

    if (parsed.isBefore(start) || parsed.isAfter(end)) return [0, 0];
    return [start.diff(date, "days"), end.diff(date, "days")];
  }

  #resolveAnchorDate(base: MomentDate): JournalAnchorDate {
    const type = this.#settings.value.type;
    const start_date = base.startOf(type);
    if (this.#settings.value.type === "week") {
      const end_date = base.clone().endOf(type);
      if (!start_date.isSame(end_date, "year") && start_date.week() === 1) {
        return JournalAnchorDate(end_date.format(FRONTMATTER_DATE_FORMAT));
      }
    }
    return JournalAnchorDate(start_date.format(FRONTMATTER_DATE_FORMAT));
  }
}
