import { type MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { JournalManager } from "../journal-manager";
import type { JournalFrontMatter } from "../contracts/config.types";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { timelineGranularityMapping, timelineModes } from "./timeline-mappings";

export class CodeBlockTimelineProcessor extends MarkdownRenderChild {
  private data: JournalFrontMatter | null = null;
  private mode: string | undefined;
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
      this.containerEl.appendText("Note is not connected to a journal.");
      return;
    }
    const journal = this.manager.get(this.data.id);
    if (!journal) {
      this.containerEl.appendText("Note is connected to a deleted journal.");
      return;
    }
    if (!(journal instanceof CalendarJournal)) {
      this.containerEl.appendText("Note is connected to a non-calendar journal.");
      return;
    }
    const container = this.containerEl.createDiv();

    const mode = this.getMode();
    if (!(mode in timelineModes)) {
      this.containerEl.appendText(
        `Unknown mode: ${mode}. Supported modes are ${Object.keys(timelineModes).join(", ")}.`,
      );
      return;
    }

    const Block = timelineModes[mode as keyof typeof timelineModes];
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
    return timelineGranularityMapping[this.data.granularity];
  }
}
