import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { JournalManager } from "../journal-manager";
import { JournalFrontMatter } from "../contracts/config.types";
import { CodeBlockMonth } from "./code-block-month";
import { CodeBlockWeek } from "./code-block-week";
import { CodeBlockCalendar } from "./code-block-calendar";
import { CodeBlockQuarter } from "./code-block-quarter";
import { CalendarJournal } from "../calendar-journal/calendar-journal";

const modes = {
  month: CodeBlockMonth,
  week: CodeBlockWeek,
  quarter: CodeBlockQuarter,
  calendar: CodeBlockCalendar,
};

export class CodeBlockTimelineProcessor extends MarkdownRenderChild {
  private data: JournalFrontMatter | null = null;
  private mode: string;
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
    const lines = this.source.split("\n");
    for (const line of lines) {
      const [key, value] = line.split(":");
      if (key.trim() === "mode") {
        this.mode = value.trim();
      }
    }
    this.data = await this.manager.getJournalData(this.ctx.sourcePath);
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
    await Promise.resolve();

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
    const container = this.containerEl.createDiv();

    const mode = this.getMode();
    if (!(mode in modes)) {
      this.containerEl.appendText("unknown mode");
      return;
    }

    const Block = modes[mode as keyof typeof modes];
    const block = new Block(container, journal, this.data.start_date, this.ctx);
    this.ctx.addChild(block);
    block.display();
  }

  getMode(): string {
    if (this.mode) {
      return this.mode;
    }
    if (!this.data || !("granularity" in this.data)) {
      return "week";
    }
    switch (this.data?.granularity) {
      case "day":
      case "week":
        return "week";
      case "month":
        return "month";
      case "quarter":
        return "quarter";
      case "year":
        return "calendar";
    }
    return "week";
  }
}
