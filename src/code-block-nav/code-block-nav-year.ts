import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { MomentDate } from "../contracts/date.types";
import { CodeBlockNav } from "./code-block-nav";

export class CodeBlockNavYear extends CodeBlockNav {
  constructor(containerEl: HTMLElement, journal: CalendarJournal, date: string) {
    super(containerEl, journal, date);
    this.granularity = "year";
  }

  isCurrentEnabled(): boolean {
    return this.journal.config.yearly.enabled;
  }
  openDate(date: string): void {
    this.journal.yearly.open(date);
  }

  renderOne(parent: HTMLElement, date: MomentDate, clickable = true) {
    const yearWrapper = parent.createDiv({
      cls: "journal-nav-year-wrapper",
    });
    yearWrapper.createDiv({
      cls: "journal-nav-year",
      text: date.format("YYYY"),
    });
    if (clickable && this.journal.config.yearly.enabled) {
      yearWrapper.classList.add("journal-clickable");
      yearWrapper.dataset.date = date.format("YYYY");
      yearWrapper.on("click", ".journal-nav-year-wrapper", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.yearly.open(date);
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
    const fromNow = date.diff(thisQuarter, "quarter");
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
