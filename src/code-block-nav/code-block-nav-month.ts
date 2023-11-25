import { MarkdownPostProcessorContext, MarkdownRenderChild, getIcon } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { MomentDate } from "../contracts/date.types";

export class CodeBlockNavMonth extends MarkdownRenderChild {
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

    const date = this.journal.date(this.date).startOf("month");

    const view = this.containerEl.createDiv({
      cls: "journal-nav-view",
    });

    const prevMonth = view.createDiv({
      cls: "journal-month-nav journal-month-nav-prev",
    });
    this.renderMonth(prevMonth, date.clone().subtract(1, "month"));

    const currentMonth = view.createDiv({
      cls: "journal-month-nav journal-month-nav-current",
    });
    this.renderMonth(currentMonth, date, false);

    const iconPrev = currentMonth.createDiv({
      cls: "journal-nav-icon journal-nav-icon-prev",
    });
    const iconPrevEl = getIcon("arrow-left");
    if (iconPrevEl) iconPrev.appendChild(iconPrevEl);

    const iconNext = currentMonth.createDiv({
      cls: "journal-nav-icon journal-nav-icon-next",
    });
    const iconNextEl = getIcon("arrow-right");
    if (iconNextEl) iconNext.appendChild(iconNextEl);

    const nextMonth = view.createDiv({
      cls: "journal-month-nav journal-month-nav-next",
    });
    this.renderMonth(nextMonth, date.clone().add(1, "month"));

    if (this.journal.config.daily.enabled) {
      iconPrev.classList.add("journal-clickable");
      iconPrev.dataset.date = date.clone().subtract(1, "month").format("YYYY-MM-DD");
      iconNext.classList.add("journal-clickable");
      iconNext.dataset.date = date.clone().add(1, "month").format("YYYY-MM-DD");

      view.on("click", ".journal-nav-icon", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.monthly.open(date);
        }
      });
    }
  }

  renderMonth(parent: HTMLElement, date: MomentDate, clickable = true) {
    const monthWrapper = parent.createDiv({
      cls: "journal-nav-month-wrapper",
    });
    monthWrapper.createDiv({
      cls: "journal-nav-month",
      text: date.format("MMMM"),
    });
    if (clickable && this.journal.config.monthly.enabled) {
      monthWrapper.dataset.date = date.format("YYYY-MM-DD");
      monthWrapper.classList.add("journal-clickable");
      monthWrapper.on("click", ".journal-nav-week", (e) => {
        console.log("click", e);
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.monthly.open(date);
        }
      });
    }
    monthWrapper.createDiv({
      cls: "journal-nav-relative",
      text: this.relativeMonth(date),
    });

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

  relativeMonth(date: MomentDate) {
    console.log(date);
    const thisMonth = this.journal.today.startOf("month");
    const fromNow = date.diff(thisMonth, "month");
    // console.log(thisMonth, date, fromNow);
    if (fromNow === 0) {
      return "This month";
    } else if (fromNow === -1) {
      return "Last month";
    } else if (fromNow === 1) {
      return "Next month";
    }
    if (fromNow < 0) {
      return `${Math.abs(fromNow)} months ago`;
    }
    return `${fromNow} months from now`;
  }
}
