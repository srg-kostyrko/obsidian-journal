import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { JournalManager } from "../journal-manager";
import { JournalFrontMatter } from "../contracts/config.types";
import { CodeBlockNavMonth } from "./code-block-nav-month";

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
    const container = this.containerEl.createDiv();

    const block = new CodeBlockNavMonth(container, journal, this.data.start_date, this.ctx);
    this.ctx.addChild(block);
    block.display();
  }
}
