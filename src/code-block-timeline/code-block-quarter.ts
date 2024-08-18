import { type MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { CodeBlockMonth } from "./code-block-month";

export class CodeBlockQuarter extends MarkdownRenderChild {
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

    const start = this.journal.quarter.getRangeStart(this.date);
    const end = this.journal.quarter.getRangeEnd(this.date);

    const name = this.containerEl.createEl("h6", {
      cls: "journal-name",
      text: start.format("[Q]Q YYYY"),
    });
    if (this.addLinks && this.journal.config.quarter.enabled) {
      name.classList.add("journal-clickable");
      name.on("click", ".journal-name", () => {
        this.journal.quarter.open(this.date);
      });
    }

    const view = this.containerEl.createDiv({
      cls: "journal-calendar-view",
    });

    const curr = start.clone();
    while (curr.isSame(end, "quarter")) {
      const month = view.createDiv();
      const monthView = new CodeBlockMonth(month, this.journal, curr.format("YYYY-MM-DD"), this.ctx, this.addLinks);
      monthView.showPrevMonthDays = false;
      this.ctx.addChild(monthView);
      monthView.display();
      curr.add(1, "month");
    }
  }
}
