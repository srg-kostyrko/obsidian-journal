import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { MomentDate } from "../contracts/date.types";
import { CodeBlockNav } from "./code-block-nav";

export class CodeBlockNavYear extends CodeBlockNav {
  constructor(containerEl: HTMLElement, journal: CalendarJournal, date: string, addLinks = true) {
    super(containerEl, journal, date, addLinks);
    this.granularity = "year";
  }

  isCurrentEnabled(): boolean {
    return this.journal.config.year.enabled;
  }
  openDate(date: string): void {
    this.journal.year.open(date);
  }

  renderOne(parent: HTMLElement, date: MomentDate, clickable = true) {
    const yearWrapper = parent.createDiv({
      cls: "journal-nav-year-wrapper",
    });
    yearWrapper.createDiv({
      cls: "journal-nav-year",
      text: date.format("YYYY"),
    });
    if (this.addLinks && clickable && this.journal.config.year.enabled) {
      yearWrapper.classList.add("journal-clickable");
      yearWrapper.dataset.date = date.format("YYYY");
      yearWrapper.on("click", ".journal-nav-year-wrapper", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.year.open(date);
        }
      });
    }
    yearWrapper.createDiv({
      cls: "journal-nav-relative",
      text: this.relativeYear(date),
    });
  }

  relativeYear(date: MomentDate) {
    const thisQuarter = this.journal.today.startOf(this.granularity);
    const fromNow = date.diff(thisQuarter, "year");
    if (fromNow === 0) {
      return "This year";
    } else if (fromNow === -1) {
      return "Last year";
    } else if (fromNow === 1) {
      return "Next year";
    }
    if (fromNow < 0) {
      return `${Math.abs(fromNow)} years ago`;
    }
    return `${fromNow} years from now`;
  }
}
