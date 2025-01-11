import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { JournalManager } from "../journal-manager";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { CodeBlockHome } from "./code-block-home";
import { JournalFrontMatter } from "../contracts/config.types";

export class CodeBlockHomeProcessor extends MarkdownRenderChild {
  private journalData: JournalFrontMatter | null = null;

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
    this.journalData = await this.manager.getJournalData(this.ctx.sourcePath);
    this.display();
  }

  async display() {
    this.containerEl.empty();
    const container = this.containerEl.createDiv();

    let defaultJournal: CalendarJournal | undefined;
    if (this.journalData?.id) {
      const journal = this.manager.get(this.journalData.id);
      if (journal instanceof CalendarJournal) {
        defaultJournal = journal;
      }
    }

    const block = new CodeBlockHome(container, this.manager, defaultJournal);
    this.ctx.addChild(block);
    block.display();
  }
}
