import { MarkdownPostProcessorContext, MarkdownRenderChild, getIcon } from "obsidian";
import { JournalManager } from "../journal-manager";
import { JournalFrontMatter } from "../contracts/config.types";
import { IntervalJournal } from "../interval-journal/interval-journal";
import { Interval } from "../interval-journal/interval-manager";
import { replaceTemplateVariables } from "../utils/template";

export class CodeBlockIntervalProcessor extends MarkdownRenderChild {
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
    if (!(journal instanceof IntervalJournal)) {
      this.containerEl.appendText("not an interval journal");
      return;
    }

    const view = this.containerEl.createDiv({
      cls: "interval-nav-view",
    });

    const prevInterval = journal.findPreviousInterval(this.data.start_date);
    const prevBlock = view.createDiv({
      cls: `interval-nav-prev`,
    });
    this.renderInterval(prevBlock, prevInterval, journal);

    const currentInterval = journal.findInterval(this.data.start_date);
    const current = view.createDiv({
      cls: `interval-nav-current`,
    });
    this.renderInterval(current, currentInterval, journal, false);

    const iconPrev = current.createDiv({
      cls: "interval-nav-icon interval-nav-icon-prev",
    });
    const iconPrevEl = getIcon("arrow-left");
    if (iconPrevEl) iconPrev.appendChild(iconPrevEl);
    iconPrev.classList.add("journal-clickable");
    iconPrev.dataset.date = prevInterval.startDate.format("YYYY-MM-DD");
    iconPrev.on("click", ".interval-nav-icon-prev", (e) => {
      const date = (e.currentTarget as HTMLElement)?.dataset?.date;
      if (date) {
        journal.open(date);
      }
    });

    const nextInterval = journal.findNextInterval(this.data.start_date);
    const iconNext = current.createDiv({
      cls: "interval-nav-icon interval-nav-icon-next",
    });
    const iconNextEl = getIcon("arrow-right");
    if (iconNextEl) iconNext.appendChild(iconNextEl);

    iconNext.classList.add("journal-clickable");
    iconNext.dataset.date = nextInterval.startDate.format("YYYY-MM-DD");

    iconNext.on("click", ".interval-nav-icon-next", (e) => {
      const date = (e.currentTarget as HTMLElement)?.dataset?.date;
      if (date) {
        journal.open(date);
      }
    });

    const nextBlock = view.createDiv({
      cls: `interval-nav-next`,
    });
    this.renderInterval(nextBlock, nextInterval, journal);
  }

  renderInterval(parent: HTMLElement, interval: Interval, journal: IntervalJournal, addLinks = true) {
    const context = journal.getTemplateContext(interval);
    const wrapper = parent.createDiv({
      cls: "interval-wrapper",
    });
    if (addLinks) {
      wrapper.classList.add("journal-clickable");
      wrapper.on("click", ".interval-wrapper", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          journal.open(date);
        }
      });
    }
    wrapper.dataset.date = interval.startDate.format("YYYY-MM-DD");
    const title = replaceTemplateVariables(journal.config.titleTemplate, context);
    wrapper.createDiv({
      cls: "interval-title",
      text: title,
    });
    const dates = wrapper.createDiv({
      cls: "interval-dates",
    });
    dates.createDiv({
      cls: "interval-start",
      text: interval.startDate.format(journal.config.dateFormat),
    });
    dates.createSpan({
      cls: "interval-separator",
      text: " to ",
    });
    dates.createDiv({
      cls: "interval-end",
      text: interval.endDate.format(journal.config.dateFormat),
    });
  }
}
