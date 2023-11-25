import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";

export class CodeBlockWeek extends MarkdownRenderChild {
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
    const today = this.journal.today;

    const start = this.journal.weekly.getRangeStart(this.date);
    const end = this.journal.weekly.getRangeEnd(this.date);

    const title = this.containerEl.createEl("h6", {
      cls: "journal-title",
      text: start.format(this.journal.config.weekly.dateFormat),
    });
    if (this.journal.config.weekly.enabled) {
      title.classList.add("journal-clickable");
      title.on("click", ".journal-title", () => {
        this.journal.weekly.open(this.date);
      });
    }
    const view = this.containerEl.createDiv({
      cls: "journal-week-view",
    });
    if (this.journal.config.daily.enabled) {
      view.on("click", ".journal-weekday", (e) => {
        const date = (e.target as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.daily.open(date);
        }
      });
    }

    while (start.isSameOrBefore(end)) {
      const cls = ["journal-weekday"];
      if (start.isSame(today, "day")) {
        cls.push("journal-is-today");
      }
      if (this.journal.config.daily.enabled) {
        cls.push("journal-clickable");
      }

      const day = view.createDiv({
        cls,
      });
      day.createDiv({
        cls: "journal-day-of-week",
        text: start.format("ddd"),
      });
      day.createDiv({
        cls: "journal-day",
        text: start.format("D"),
      });
      day.dataset.date = start.format("YYYY-MM-DD");
      start.add(1, "day");
    }
  }
}
