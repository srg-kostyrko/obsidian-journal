import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";

export class CodeBlockWeek extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    protected journal: CalendarJournal,
    protected date: string,
    protected ctx: MarkdownPostProcessorContext,
    protected addLinks = true,
  ) {
    super(containerEl);
  }

  display() {
    this.containerEl.empty();
    const today = this.journal.today;

    const start = this.journal.week.getRangeStart(this.date);
    const end = this.journal.week.getRangeEnd(this.date);

    const name = this.containerEl.createEl("h6", {
      cls: "journal-name",
      text: start.format(this.journal.week.dateFormat),
    });
    if (this.addLinks && this.journal.config.week.enabled) {
      name.classList.add("journal-clickable");
      name.on("click", ".journal-name", () => {
        this.journal.week.open(this.date);
      });
    }
    const view = this.containerEl.createDiv({
      cls: "journal-week-view",
    });
    if (this.addLinks && this.journal.config.day.enabled) {
      view.on("click", ".journal-weekday", (e) => {
        const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
        if (date) {
          this.journal.day.open(date);
        }
      });
    }

    while (start.isSameOrBefore(end)) {
      const cls = ["journal-weekday"];
      if (start.isSame(today, "day")) {
        cls.push("journal-is-today");
      }
      if (this.addLinks && this.journal.config.day.enabled) {
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
