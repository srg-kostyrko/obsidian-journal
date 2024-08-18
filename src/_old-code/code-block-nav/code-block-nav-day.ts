import { CalendarJournal } from "../calendar-journal/calendar-journal";
import type { MomentDate } from "../contracts/date.types";
import { CodeBlockNav } from "./code-block-nav";

export class CodeBlockNavDay extends CodeBlockNav {
  constructor(containerEl: HTMLElement, journal: CalendarJournal, date: string, addLinks = true) {
    super(containerEl, journal, date, addLinks);
  }

  isCurrentEnabled(): boolean {
    return this.journal.config.day.enabled;
  }

  openDate(date: string): void {
    this.journal.day.open(date);
  }

  renderOne(parent: HTMLElement, date: MomentDate, clickable = true) {
    const dayWrapper = parent.createDiv({
      cls: "journal-nav-day-wrapper",
    });
    dayWrapper.createDiv({
      cls: "journal-nav-weekday",
      text: date.format("ddd"),
    });
    dayWrapper.createDiv({
      cls: "journal-nav-day",
      text: date.format("D"),
    });
    dayWrapper.createDiv({
      cls: "journal-nav-relative",
      text: this.relativeDay(date),
    });
    if (this.addLinks && clickable && this.journal.config.day.enabled) {
      dayWrapper.dataset.date = date.format("YYYY-MM-DD");
      dayWrapper.classList.add("journal-clickable");
      dayWrapper.on("click", ".journal-nav-day-wrapper", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.day.open(date);
        }
      });
    }

    if (this.journal.config.week.enabled) {
      this.renderWeek(parent, date);
    }
    this.renderMonth(parent, date);
    this.renderYear(parent, date);
  }

  relativeDay(date: MomentDate) {
    const today = this.journal.today;

    return date.calendar(today, {
      lastWeek: "[Last] dddd",
      lastDay: "[Yesterday]",
      sameDay: "[Today]",
      nextDay: "[Tomorrow]",
      nextWeek: "dddd",
      sameElse: function () {
        return "[" + date.from(today) + "]";
      },
    });
  }
}
