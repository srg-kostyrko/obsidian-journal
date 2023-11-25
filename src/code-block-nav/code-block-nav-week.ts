import { MarkdownPostProcessorContext, MarkdownRenderChild, getIcon } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { MomentDate } from "../contracts/date.types";

export class CodeBlockNavWeek extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    protected journal: CalendarJournal,
    protected date: string,
    protected ctx: MarkdownPostProcessorContext,
  ) {
    super(containerEl);
  }

  display() {
    this.containerEl.empty();

    const date = this.journal.date(this.date).startOf("week");

    const view = this.containerEl.createDiv({
      cls: "journal-nav-view",
    });

    const prevWeek = view.createDiv({
      cls: "journal-week-nav journal-week-nav-prev",
    });
    this.renderWeek(prevWeek, date.clone().subtract(1, "week"));

    const currentWeek = view.createDiv({
      cls: "journal-week-nav journal-week-nav-current",
    });
    this.renderWeek(currentWeek, date, false);

    const iconPrev = currentWeek.createDiv({
      cls: "journal-nav-icon journal-nav-icon-prev",
    });
    const iconPrevEl = getIcon("arrow-left");
    if (iconPrevEl) iconPrev.appendChild(iconPrevEl);

    const iconNext = currentWeek.createDiv({
      cls: "journal-nav-icon journal-nav-icon-next",
    });
    const iconNextEl = getIcon("arrow-right");
    if (iconNextEl) iconNext.appendChild(iconNextEl);

    const nextDay = view.createDiv({
      cls: "journal-week-nav journal-week-nav-next",
    });
    this.renderWeek(nextDay, date.clone().add(1, "week"));

    if (this.journal.config.daily.enabled) {
      iconPrev.classList.add("journal-clickable");
      iconPrev.dataset.date = date.clone().subtract(1, "week").format("YYYY-MM-DD");
      iconNext.classList.add("journal-clickable");
      iconNext.dataset.date = date.clone().add(1, "week").format("YYYY-MM-DD");

      view.on("click", ".journal-day-nav-icon", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.weekly.open(date);
        }
      });
    }
  }

  renderWeek(parent: HTMLElement, date: MomentDate, weekClickable = true) {
    const weekWrapper = parent.createDiv({
      cls: "journal-nav-week-wrapper",
    });
    weekWrapper.createDiv({
      cls: "journal-nav-week",
      text: date.format("[W]ww"),
    });
    if (weekClickable && this.journal.config.daily.enabled) {
      weekWrapper.dataset.date = date.format("YYYY-MM-DD");
      weekWrapper.classList.add("journal-clickable");
      weekWrapper.on("click", ".journal-nav-week", (e) => {
        console.log("click", e);
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.weekly.open(date);
        }
      });
    }
    weekWrapper.createDiv({
      cls: "journal-nav-relative",
      text: this.relativeWeek(date),
    });

    const month = parent.createDiv({
      cls: "journal-nav-month",
      text: date.format("MMMM"),
    });
    if (this.journal.config.monthly.enabled) {
      month.classList.add("journal-clickable");
      month.dataset.date = date.format("YYYY-MM");
      month.on("click", ".journal-nav-month", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.monthly.open(date);
        }
      });
    }
    const year = parent.createDiv({
      cls: "journal-nav-year",
      text: date.format("YYYY"),
    });
    if (this.journal.config.yearly.enabled) {
      year.classList.add("journal-clickable");
      year.dataset.date = date.format("YYYY");
      year.on("click", ".journal-nav-year", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.yearly.open(date);
        }
      });
    }
  }

  relativeWeek(date: MomentDate) {
    const thisWeek = this.journal.today.startOf("week");
    const fromNow = date.diff(thisWeek, "week");
    console.log(thisWeek, date, fromNow);
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
