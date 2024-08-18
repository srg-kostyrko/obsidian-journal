import { type MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { JournalManager } from "../journal-manager";
import type { JournalFrontMatter } from "../contracts/config.types";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { navBlocks } from "./nav-blocks";

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
      this.containerEl.appendText("Note is not connected to a journal.");
      return;
    }
    const journal = this.manager.get(this.data.id);
    if (!journal) {
      this.containerEl.appendText("Note is connected to deleted journal.");
      return;
    }
    if (!(journal instanceof CalendarJournal)) {
      this.containerEl.appendText("Note is connected to non-calendar journal.");
      return;
    }
    if (!("granularity" in this.data)) {
      this.containerEl.appendText("Note is missing granularity definition.");
      return;
    }
    const container = this.containerEl.createDiv();

    const Block = navBlocks[this.data.granularity];
    const block = new Block(container, journal, this.data.start_date);
    this.ctx.addChild(block);
    block.display();
  }
}
