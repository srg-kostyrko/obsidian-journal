import type { JournalCommand, WriteCustom } from "@/types/settings.types";
import { JournalAnchorDate, type AnchorDateResolver } from "../types/journal.types";
import type { ComputedRef } from "vue";
import { date_from_string, today } from "@/calendar";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";
import type { JournalsIndex } from "./journals-index";

export class CustomIntervalResolver implements AnchorDateResolver {
  #settings: ComputedRef<WriteCustom>;

  constructor(
    private journalName: string,
    settings: ComputedRef<WriteCustom>,
    private index: JournalsIndex,
  ) {
    this.#settings = settings;
  }

  get repeats() {
    return this.#settings.value.duration;
  }

  get duration() {
    return this.#settings.value.every;
  }

  resolveForDate(date: string): JournalAnchorDate | null {
    const index = this.index.getJournalIndex(this.journalName);

    const closest = index.findClosestDate(date);
    if (closest) {
      if (closest === date) return closest;
      return closest <= date ? this.#resolveDateAfterKnown(date, closest) : this.#resolveDateBeforeKnown(date, closest);
    }

    const startDate = this.#settings.value.anchorDate;
    const endDate = this.resolveEndDate(startDate);
    if (date >= startDate && date < endDate) {
      return startDate;
    } else if (date < startDate) {
      return this.#resolveDateBeforeKnown(date, startDate);
    } else {
      return this.#resolveDateAfterKnown(date, startDate);
    }
  }
  resolveNext(date: string): JournalAnchorDate | null {
    const anchorDate = this.resolveForDate(date);
    if (!anchorDate) return null;
    const currentEnd = this.resolveEndDate(anchorDate);
    return JournalAnchorDate(date_from_string(currentEnd).add(1, "day").format(FRONTMATTER_DATE_FORMAT));
  }
  resolvePrevious(date: string): JournalAnchorDate | null {
    const anchorDate = this.resolveForDate(date);
    if (!anchorDate) return null;
    const index = this.index.getJournalIndex(this.journalName);
    const previousEnd = date_from_string(anchorDate).subtract(1, "day");
    const closest = index.findClosestDate(previousEnd.format(FRONTMATTER_DATE_FORMAT));
    if (closest) {
      const closestData = this.index.get(this.journalName, closest);
      if (closestData?.end_date && previousEnd.isSame(closestData.end_date, "day")) {
        return closest;
      }
    }
    const previousStart = date_from_string(anchorDate).subtract(
      this.#settings.value.duration,
      this.#settings.value.every,
    );
    return JournalAnchorDate(previousStart.format(FRONTMATTER_DATE_FORMAT));
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
    const existing = this.index.get(this.journalName, anchorDate);
    const currentEnd = existing?.end_date
      ? date_from_string(existing.end_date)
      : date_from_string(anchorDate).add(this.#settings.value.duration, this.#settings.value.every).subtract(1, "day");

    return currentEnd.format(FRONTMATTER_DATE_FORMAT);
  }
  resolveRelativeDate(anchorDate: JournalAnchorDate): string {
    const current = this.resolveForDate(today().format(FRONTMATTER_DATE_FORMAT));
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
    const anchorDate = this.resolveForDate(date);
    if (!anchorDate) return [0, 0];
    const dateMoment = date_from_string(date);
    const start = date_from_string(anchorDate);
    const end = date_from_string(this.resolveEndDate(anchorDate));

    return [dateMoment.diff(start, "days") + 1, dateMoment.diff(end, "days") - 1];
  }
  countRepeats(startDate: string, endDate: string): number {
    const start = this.resolveForDate(startDate);
    const end = this.resolveForDate(endDate);
    if (!start || !end) return 0;
    let startMoment = date_from_string(start);
    let endMoment = date_from_string(end);
    if (startMoment.isAfter(endMoment)) {
      [startMoment, endMoment] = [endMoment, startMoment];
    }
    let count = 0;
    while (startMoment.isBefore(endMoment)) {
      ++count;
      const next = this.resolveNext(startMoment.format(FRONTMATTER_DATE_FORMAT));
      if (!next) break;
      startMoment = date_from_string(next);
    }
    return startDate > endDate ? -count : count;
  }

  #resolveDateBeforeKnown(target: string, known: JournalAnchorDate): JournalAnchorDate | null {
    const index = this.index.getJournalIndex(this.journalName);

    let knownStart = date_from_string(known);

    let found = false;
    while (!found) {
      const previousEnd = knownStart.clone().subtract(1, "day");
      const closest = index.findClosestDate(previousEnd.format(FRONTMATTER_DATE_FORMAT));
      let previousStart = knownStart.subtract(this.#settings.value.duration, this.#settings.value.every);
      if (closest) {
        const closestData = this.index.get(this.journalName, closest);
        if (closestData?.end_date && previousEnd.isSame(closestData.end_date, "day")) {
          previousStart = date_from_string(closest);
        }
      }

      if (previousStart.isSameOrBefore(target, "day") && previousEnd.isSameOrAfter(target, "day")) {
        found = true;
      } else {
        knownStart = previousStart.clone();
      }
    }
    return JournalAnchorDate(knownStart.format(FRONTMATTER_DATE_FORMAT));
  }

  #resolveDateAfterKnown(target: string, known: JournalAnchorDate): JournalAnchorDate | null {
    let currentStart = date_from_string(known);
    let found = false;
    while (!found) {
      const currentEnd = date_from_string(
        this.resolveEndDate(JournalAnchorDate(currentStart.format(FRONTMATTER_DATE_FORMAT))),
      );
      if (currentStart.isSameOrBefore(target, "day") && currentEnd.isSameOrAfter(target, "day")) {
        found = true;
      } else {
        currentStart = currentEnd.clone().add(1, "day");
      }
    }
    return JournalAnchorDate(currentStart.format(FRONTMATTER_DATE_FORMAT));
  }
}
