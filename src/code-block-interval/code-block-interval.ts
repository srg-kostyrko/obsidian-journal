import { MarkdownRenderChild, getIcon } from "obsidian";
import { IntervalJournal } from "../interval-journal/interval-journal";
import { Interval } from "../interval-journal/interval-manager";
import { replaceTemplateVariables } from "../utils/template";

export class CodeBlockIntervalNav extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    private journal: IntervalJournal,
    private startDate: string,
    private addLinks = true,
  ) {
    super(containerEl);
  }

  display() {
    this.containerEl.empty();
    const view = this.containerEl.createDiv({
      cls: "interval-nav-view",
    });

    const prevInterval = this.journal.findPreviousInterval(this.startDate);
    const prevBlock = view.createDiv({
      cls: `interval-nav-prev`,
    });
    this.renderInterval(prevBlock, prevInterval, this.journal);

    const currentInterval = this.journal.findInterval(this.startDate);
    const current = view.createDiv({
      cls: `interval-nav-current`,
    });
    this.renderInterval(current, currentInterval, this.journal, false);

    const iconPrev = current.createDiv({
      cls: "interval-nav-icon interval-nav-icon-prev",
    });
    const iconPrevEl = getIcon("arrow-left");
    if (iconPrevEl) iconPrev.appendChild(iconPrevEl);
    if (this.addLinks) {
      iconPrev.classList.add("journal-clickable");
      iconPrev.dataset.date = prevInterval.startDate.format("YYYY-MM-DD");
      iconPrev.on("click", ".interval-nav-icon-prev", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.open(date);
        }
      });
    }

    const nextInterval = this.journal.findNextInterval(this.startDate);
    const iconNext = current.createDiv({
      cls: "interval-nav-icon interval-nav-icon-next",
    });
    const iconNextEl = getIcon("arrow-right");
    if (iconNextEl) iconNext.appendChild(iconNextEl);

    if (this.addLinks) {
      iconNext.classList.add("journal-clickable");
      iconNext.dataset.date = nextInterval.startDate.format("YYYY-MM-DD");
      iconNext.on("click", ".interval-nav-icon-next", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          this.journal.open(date);
        }
      });
    }

    const nextBlock = view.createDiv({
      cls: `interval-nav-next`,
    });
    this.renderInterval(nextBlock, nextInterval, this.journal);
  }

  renderInterval(parent: HTMLElement, interval: Interval, journal: IntervalJournal, addLinks = true) {
    const context = journal.getTemplateContext(interval);
    const wrapper = parent.createDiv({
      cls: "interval-wrapper",
    });
    if (this.addLinks && addLinks) {
      wrapper.classList.add("journal-clickable");
      wrapper.on("click", ".interval-wrapper", (e) => {
        const date = (e.currentTarget as HTMLElement)?.dataset?.date;
        if (date) {
          journal.open(date);
        }
      });
    }
    wrapper.dataset.date = interval.startDate.format("YYYY-MM-DD");
    const name = replaceTemplateVariables(journal.config.nameTemplate, context);
    wrapper.createDiv({
      cls: "interval-name",
      text: name,
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
