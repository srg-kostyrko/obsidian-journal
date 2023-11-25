import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { CodeBlockMonth } from "./code-block-month";

export class CodeBlockQuarter extends MarkdownRenderChild {
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

    const start = this.journal.quarterly.getRangeStart(this.date);
    const end = this.journal.quarterly.getRangeEnd(this.date);

    const title = this.containerEl.createEl("h6", {
      cls: "journal-title",
      text: start.format("[Q]Q YYYY"),
    });
    if (this.journal.config.quarterly.enabled) {
      title.classList.add("journal-clickable");
      title.on("click", ".journal-title", () => {
        this.journal.quarterly.open(this.date);
      });
    }

    const view = this.containerEl.createDiv({
      cls: "journal-calendar-view",
    });

    const curr = start.clone();
    while (curr.isSame(end, "quarter")) {
      const month = view.createDiv();
      const monthView = new CodeBlockMonth(month, this.journal, curr.format("YYYY-MM-DD"), this.ctx);
      monthView.showPrevMonthDays = false;
      this.ctx.addChild(monthView);
      monthView.display();
      curr.add(1, "month");
    }
  }
}
