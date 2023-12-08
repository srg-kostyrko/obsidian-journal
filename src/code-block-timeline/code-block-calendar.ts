import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { CodeBlockMonth } from "./code-block-month";

export class CodeBlockCalendar extends MarkdownRenderChild {
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

    const start = this.journal.yearly.getRangeStart(this.date);
    const end = this.journal.yearly.getRangeEnd(this.date);

    const name = this.containerEl.createEl("h6", {
      cls: "journal-name",
      text: start.format("YYYY"),
    });
    if (this.journal.config.yearly.enabled) {
      name.classList.add("journal-clickable");
      name.on("click", ".journal-name", () => {
        this.journal.yearly.open(this.date);
      });
    }

    const view = this.containerEl.createDiv({
      cls: "journal-calendar-view",
    });

    const curr = start.clone();
    while (curr.isSameOrBefore(end, "year")) {
      const month = view.createDiv();
      const monthView = new CodeBlockMonth(month, this.journal, curr.format("YYYY-MM-DD"), this.ctx);
      monthView.showPrevMonthDays = false;
      this.ctx.addChild(monthView);
      monthView.display();
      curr.add(1, "month");
    }
  }
}
