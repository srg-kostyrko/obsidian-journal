import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { MomentDate } from "../contracts/date.types";
import { CodeBlockNav } from "./code-block-nav";

export class CodeBlockNavWeek extends CodeBlockNav {
  constructor(containerEl: HTMLElement, journal: CalendarJournal, date: string, addLinks = true) {
    super(containerEl, journal, date, addLinks);
    this.granularity = "week";
  }

  isCurrentEnabled(): boolean {
    return this.journal.config.weekly.enabled;
  }
  openDate(date: string): void {
    this.journal.weekly.open(date);
  }

  renderOne(parent: HTMLElement, date: MomentDate, weekClickable = true) {
    const weekWrapper = parent.createDiv({
      cls: "journal-nav-week-wrapper",
    });
    this.renderWeek(weekWrapper, date, weekClickable);
    const relative = weekWrapper.createDiv({
      cls: "journal-nav-relative",
      text: this.relativeWeek(date),
    });
    if (this.addLinks && weekClickable && this.journal.config.weekly.enabled) {
      relative.dataset.date = date.format("YYYY-MM-DD");
      relative.classList.add("journal-clickable");
      relative.on("click", ".journal-nav-relative", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.weekly.open(date);
        }
      });
    }

    this.renderMonth(parent, date);
    this.renderYear(parent, date);
  }

  relativeWeek(date: MomentDate) {
    const thisWeek = this.journal.today.startOf("week");
    const fromNow = date.diff(thisWeek, "week");
    if (fromNow === 0) {
      return "This week";
    } else if (fromNow === -1) {
      return "Last week";
    } else if (fromNow === 1) {
      return "Next week";
    }
    if (fromNow < 0) {
      return `${Math.abs(fromNow)} weeks ago`;
    }
    return `${fromNow} weeks from now`;
  }
}
