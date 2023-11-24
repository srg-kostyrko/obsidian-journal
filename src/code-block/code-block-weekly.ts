import { MarkdownRenderChild, moment } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";

export class CodeBlockWeekly extends MarkdownRenderChild {
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

    const start = this.journal.weekly.getRangeStart(this.date);
    const end = this.journal.weekly.getRangeEnd(this.date);

    const title = this.containerEl.createEl("h6", {
      cls: "journal-weekly-title",
      text: start.format(this.journal.config.weekly.dateFormat),
    });
    if (this.journal.config.weekly.enabled) {
      title.classList.add("journal-clickable");
      title.on("click", ".journal-weekly-title", () => {
        this.journal.weekly.open(this.date);
      });
    }
    const view = this.containerEl.createDiv({
      cls: "journal-weekly-view",
    });

    while (start.isSameOrBefore(end)) {
      const cls = ["journal-weekly-weekday"];
      if (start.isSame(today, "day")) {
        cls.push("journal-is-today");
      }

      const day = view.createDiv({
        cls,
      });
      day.createDiv({
        cls: "journal-weekly-day-of-week",
        text: start.format("ddd"),
      });
      day.createDiv({
        cls: "journal-weekly-day",
        text: start.format("DD"),
      });
      const date = start.format("YYYY-MM-DD");
      day.on("click", ".journal-weekly-day", () => {
        console.log(date);
        this.journal.daily.open(date);
      });
      start.add(1, "day");
    }
  }
}
