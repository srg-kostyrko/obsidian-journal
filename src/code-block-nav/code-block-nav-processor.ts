import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { JournalManager } from "../journal-manager";
import { JournalFrontMatter } from "../contracts/config.types";
import { CodeBlockNavYear } from "./code-block-nav-year";
import { CodeBlockNavQuarter } from "./code-block-nav-quarter";
import { CodeBlockNavMonth } from "./code-block-nav-month";
import { CodeBlockNavWeek } from "./code-block-nav-week";
import { CodeBlockNavDay } from "./code-block-nav-day";
import { CalendarJournal } from "../calendar-journal/calendar-journal";

const blocks = {
  day: CodeBlockNavDay,
  week: CodeBlockNavWeek,
  month: CodeBlockNavMonth,
  quarter: CodeBlockNavQuarter,
  year: CodeBlockNavYear,
};

export class CodeBlockNavProcessor extends MarkdownRenderChild {
  private data: JournalFrontMatter | null = null;
  constructor(
    private manager: JournalManager,
    private readonly source: string,
    private readonly el: HTMLElement,
    private readonly ctx: MarkdownPostProcessorContext,
  ) {
    super(el);

    this.init();
  }

  async init() {
    await this.readData();
    if (!this.data) {
      setTimeout(async () => {
        await this.readData();
        this.display();
      }, 150);
      return;
    }
    this.display();
  }

  async readData(): Promise<void> {
    this.data = await this.manager.getJournalData(this.ctx.sourcePath);
  }

  async display() {
    this.containerEl.empty();

    if (!this.data) {
      this.containerEl.appendText("no data");
      return;
    }
    const journal = this.manager.get(this.data.id) || this.manager.defaultJournal;
    if (!journal) {
      this.containerEl.appendText("no journal");
      return;
    }
    if (!(journal instanceof CalendarJournal)) {
      this.containerEl.appendText("not a calendar journal");
      return;
    }
    if (!("granularity" in this.data)) {
      this.containerEl.appendText("no granularity");
      return;
    }
    const container = this.containerEl.createDiv();

    const Block = blocks[this.data.granularity];
    const block = new Block(container, journal, this.data.start_date);
    this.ctx.addChild(block);
    block.display();
  }
}
