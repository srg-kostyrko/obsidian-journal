import { MarkdownPostProcessorContext, MarkdownRenderChild, getIcon } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { MomentDate } from "../contracts/date.types";

export class CodeBlockNavDay extends MarkdownRenderChild {
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
    // const today = this.journal.today;
    const date = this.journal.date(this.date);

    const view = this.containerEl.createDiv({
      cls: "journal-day-nav-view",
    });

    const prevDay = view.createDiv({
      cls: "journal-day-nav journal-day-nav-prev",
    });
    this.renderDay(prevDay, date.clone().subtract(1, "day"));

    const currentDay = view.createDiv({
      cls: "journal-day-nav journal-day-nav-current",
    });
    this.renderDay(currentDay, date, false);

    const iconPrev = currentDay.createDiv({
      cls: "journal-day-nav-icon journal-day-nav-icon-prev",
    });
    const iconPrevEl = getIcon("arrow-left");
    if (iconPrevEl) iconPrev.appendChild(iconPrevEl);

    const iconNext = currentDay.createDiv({
      cls: "journal-day-nav-icon journal-day-nav-icon-next",
    });
    const iconNextEl = getIcon("arrow-right");
    if (iconNextEl) iconNext.appendChild(iconNextEl);

    const nextDay = view.createDiv({
      cls: "journal-day-nav journal-day-nav-next",
    });
    this.renderDay(nextDay, date.clone().add(1, "day"));

    if (this.journal.config.daily.enabled) {
      iconPrev.classList.add("journal-clickable");
      iconPrev.dataset.date = date.clone().subtract(1, "day").format("YYYY-MM-DD");
      iconPrev.on("click", ".journal-day-nav-icon-prev", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.daily.open(date);
        }
      });
      iconNext.classList.add("journal-clickable");
      iconNext.dataset.date = date.clone().add(1, "day").format("YYYY-MM-DD");
      iconNext.on("click", ".journal-day-nav-icon-next", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.daily.open(date);
        }
      });
    }
  }

  renderDay(parent: HTMLElement, date: MomentDate, dayClickable = true) {
    const dayWrapper = parent.createDiv({
      cls: "journal-nav-day-wrapper",
    });
    dayWrapper.createDiv({
      cls: "journal-nav-week",
      text: date.format("ddd"),
    });
    dayWrapper.createDiv({
      cls: "journal-nav-day",
      text: date.format("D"),
    });
    dayWrapper.createDiv({
      cls: "journal-nav-relative",
      text: this.journal.fromToday(date.format("YYYY-MM-DD")),
    });
    if (dayClickable && this.journal.config.daily.enabled) {
      dayWrapper.dataset.date = date.format("YYYY-MM-DD");
      dayWrapper.classList.add("journal-clickable");
      dayWrapper.on("click", ".journal-nav-day-wrapper", (e) => {
        console.log("click", e);
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.daily.open(date);
        }
      });
    }

    if (this.journal.config.weekly.enabled) {
      const week = parent.createDiv({
        cls: "journal-nav-week",
        text: date.format("[W]w"),
      });
      week.classList.add("journal-clickable");
      week.dataset.date = date.format("YYYY-MM-DD");
      week.on("click", ".journal-nav-week", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.weekly.open(date);
        }
      });
    }

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
}
