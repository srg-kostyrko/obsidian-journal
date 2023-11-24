import { MarkdownRenderChild, moment } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";

export class CodeBlockMonth extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    protected journal: CalendarJournal,
    protected date: string,
  ) {
    super(containerEl);
  }

  display() {
    this.containerEl.empty();
    const today = moment();

    const start = this.journal.monthly.getRangeStart(this.date);
    const end = this.journal.monthly.getRangeEnd(this.date);
    const startWithWeek = start.clone().startOf("week");
    const endWithWeek = end.clone().endOf("week");

    const title = this.containerEl.createEl("h6", {
      cls: "journal-title",
      text: start.format("MMMM YYYY"),
    });
    if (this.journal.config.monthly.enabled) {
      title.classList.add("journal-clickable");
      title.on("click", ".journal-title", () => {
        this.journal.weekly.open(this.date);
      });
    }
    const view = this.containerEl.createDiv({
      cls: "journal-month-view",
    });
    if (this.journal.config.daily.enabled) {
      view.on("click", ".journal-day", (e) => {
        const date = (e.target as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.daily.open(date);
        }
      });
    }

    const week = start.clone().startOf("week");
    const weekEnd = week.clone().endOf("week");

    while (week.isSameOrBefore(weekEnd)) {
      view.createDiv({
        cls: "journal-weekday",
        text: week.format("ddd"),
      });
      week.add(1, "day");
    }

    while (startWithWeek.isSameOrBefore(endWithWeek)) {
      const cls = ["journal-day"];
      if (startWithWeek.isSame(today, "day")) {
        cls.push("journal-is-today");
      }
      if (!startWithWeek.isSame(start, "month")) {
        cls.push("journal-is-not-same-month");
      }
      if (this.journal.config.daily.enabled) {
        cls.push("journal-clickable");
      }
      const day = view.createDiv({
        cls,
        text: startWithWeek.format("DD"),
      });
      day.dataset.date = startWithWeek.format("YYYY-MM-DD");
      startWithWeek.add(1, "day");
    }
  }
}
