import type { MomentDate } from "@/types/date.types";
import type { JournalCommand, WriteCustom } from "@/types/settings.types";
import { JournalAnchorDate, type AnchorDateResolver } from "../types/journal.types";
import type { ComputedRef } from "vue";
import { useJournalIndex } from "@/composables/use-journal-index";
import { date_from_string, today } from "@/calendar";
import { plugin$ } from "@/stores/obsidian.store";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";

export class CustomIntervalResolver implements AnchorDateResolver {
  #settings: ComputedRef<WriteCustom>;

  constructor(
    private journalName: string,
    settings: ComputedRef<WriteCustom>,
  ) {
    this.#settings = settings;
  }

  resolveForDate(date: string): JournalAnchorDate | null {
    return this.#resolveDate(date);
  }
  resolveNext(date: string): JournalAnchorDate | null {
    const anchorDate = this.resolveForDate(date);
    if (!anchorDate) return null;
    return this.#resolveDateAfterKnown(anchorDate);
  }
  resolvePrevious(date: string): JournalAnchorDate | null {
    const anchorDate = this.resolveForDate(date);
    if (!anchorDate) return null;
    return this.#resolveDateBeforeKnown(anchorDate);
  }
  resolveDateForCommand(date: string, command: JournalCommand["type"]): string | null {
    const anchorDate = this.resolveForDate(date);
    if (!anchorDate) return null;
    if (command === "next") {
      return this.resolveNext(anchorDate);
    } else if (command === "previous") {
      return this.resolvePrevious(anchorDate);
    }
    return anchorDate;
  }
  resolveStartDate(anchorDate: JournalAnchorDate): string {
    return anchorDate;
  }
  resolveEndDate(anchorDate: JournalAnchorDate): string {
    const existing = plugin$.value.index.find(this.journalName, anchorDate);
    if (existing?.end_date) {
      return existing.end_date;
    }
    return date_from_string(anchorDate)
      .add(this.#settings.value.duration, this.#settings.value.every)
      .format(FRONTMATTER_DATE_FORMAT);
  }
  resolveRelativeDate(anchorDate: JournalAnchorDate): string {
    const current = this.#resolveDate(today().format(FRONTMATTER_DATE_FORMAT));
    if (!current) return "";
    const fromNow = this.countRepeats(current, anchorDate);
    if (fromNow === 0) {
      return "This " + this.journalName;
    } else if (fromNow === -1) {
      return "Last " + this.journalName;
    } else if (fromNow === 1) {
      return "Next " + this.journalName;
    }
    if (anchorDate < current) {
      return `${Math.abs(fromNow)} ${this.journalName}s ago`;
    }
    return `${fromNow} ${this.journalName}s from now`;
  }
  calculateOffset(date: MomentDate): [positive: number, negative: number] {
    const anchorDate = this.#resolveDate(date.format(FRONTMATTER_DATE_FORMAT));
    if (!anchorDate) return [0, 0];
    const start = date_from_string(anchorDate);
    const end = date_from_string(this.resolveEndDate(anchorDate));

    return [start.diff(date, "days"), end.diff(date, "days")];
  }
  countRepeats(startDate: string, endDate: string): number {
    const start = this.#resolveDate(startDate);
    const end = this.#resolveDate(endDate);
    if (!start || !end) return 0;
    let startMoment = date_from_string(start);
    let endMoment = date_from_string(end);
    if (startMoment.isAfter(endMoment)) {
      [startMoment, endMoment] = [endMoment, startMoment];
    }
    const diff = endMoment.diff(startMoment, this.#settings.value.every) / this.#settings.value.duration;
    return Math.ceil(diff);
  }

  #resolveDate(date: string): JournalAnchorDate | null {
    const index = useJournalIndex(this.journalName);

    const closest = index.findClosestDate(date);
    if (closest) {
      if (closest <= date) {
        return this.#resolveDateAfterKnown(closest);
      } else {
        return this.#resolveDateBeforeKnown(closest);
      }
    }

    const startDate = this.#settings.value.anchorDate;
    const endDate = this.resolveEndDate(startDate);
    if (date >= startDate && date < endDate) {
      return startDate;
    } else if (date < startDate) {
      return this.#resolveDateBeforeKnown(startDate);
    } else {
      return this.#resolveDateAfterKnown(startDate);
    }
  }

  #resolveDateBeforeKnown(date: JournalAnchorDate): JournalAnchorDate | null {
    const current = date_from_string(date);
    while (current.isAfter(date, "day")) {
      current.subtract(this.#settings.value.duration, this.#settings.value.every);
    }
    return JournalAnchorDate(current.format("YYYY-MM-DD"));
  }

  #resolveDateAfterKnown(date: JournalAnchorDate): JournalAnchorDate | null {
    let current = date_from_string(date);
    while (current.isBefore(date, "day")) {
      const existing = plugin$.value.index.find(this.journalName, JournalAnchorDate(current.format("YYYY-MM-DD")));
      if (existing && existing.end_date) {
        current = date_from_string(existing.end_date).add(1, "day");
      } else {
        current.add(this.#settings.value.duration, this.#settings.value.every);
      }
    }
    return JournalAnchorDate(current.format("YYYY-MM-DD"));
  }
}
