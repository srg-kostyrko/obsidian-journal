import type { JournalCommand, WriteCustom } from "@/types/settings.types";
import { JournalAnchorDate, type AnchorDateResolver } from "../types/journal.types";
import type { ComputedRef } from "vue";
import { useJournalIndex } from "@/composables/use-journal-index";
import { date_from_string, today } from "@/calendar";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";
import type { JournalPlugin } from "@/types/plugin.types";

export class CustomIntervalResolver implements AnchorDateResolver {
  #settings: ComputedRef<WriteCustom>;

  constructor(
    private plugin: JournalPlugin,
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
    const existing = this.plugin.index.get(this.journalName, anchorDate);
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
    switch (fromNow) {
      case 0: {
        return "This " + this.journalName;
      }
      case -1: {
        return "Last " + this.journalName;
      }
      case 1: {
        return "Next " + this.journalName;
      }
      // No default
    }
    if (anchorDate < current) {
      return `${Math.abs(fromNow)} ${this.journalName}s ago`;
    }
    return `${fromNow} ${this.journalName}s from now`;
  }
  calculateOffset(date: string): [positive: number, negative: number] {
    const anchorDate = this.#resolveDate(date);
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
      return closest <= date ? this.#resolveDateAfterKnown(closest) : this.#resolveDateBeforeKnown(closest);
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
    while (current.isSameOrAfter(date, "day")) {
      current.subtract(this.#settings.value.duration, this.#settings.value.every);
    }
    return JournalAnchorDate(current.format("YYYY-MM-DD"));
  }

  #resolveDateAfterKnown(date: JournalAnchorDate): JournalAnchorDate | null {
    let current = date_from_string(date);
    while (current.isSameOrBefore(date, "day")) {
      const existing = this.plugin.index.get(this.journalName, JournalAnchorDate(current.format("YYYY-MM-DD")));
      if (existing?.end_date) {
        current = date_from_string(existing.end_date).add(1, "day");
      } else {
        current.add(this.#settings.value.duration, this.#settings.value.every);
      }
    }
    return JournalAnchorDate(current.format("YYYY-MM-DD"));
  }
}
