import { App, Modal } from "obsidian";
import { CalendarConfig, CalendarGranularity } from "../../contracts/config.types";
import { CalendarJournal } from "../../calendar-journal/calendar-journal";
import { CalendarHelper } from "../../utils/calendar";
import { timelineGranularityMapping, timelineModes } from "../../code-block-timeline/timeline-mappings";
import { stubMarkdownContext } from "./stub-markdown-context";
import { navBlocks } from "../../code-block-nav/nav-blocks";
import { SECTIONS_MAP } from "../../constants";

export class CalendarCodeBlocksModal extends Modal {
  private journal: CalendarJournal;
  constructor(
    app: App,
    config: CalendarConfig,
    calendar: CalendarHelper,
    private granularity: CalendarGranularity,
  ) {
    super(app);
    this.journal = new CalendarJournal(app, config, calendar);
  }

  onOpen(): void {
    this.titleEl.innerText = "Calendar code blocks";
    this.containerEl.addClass("calendar-code-block-modal");
    this.contentEl.on("click", ".journal-code-block", (e) => {
      navigator.clipboard.writeText((e.target as HTMLElement).innerText);
    });
    this.display();
  }

  display(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", {
      cls: "journal-hint",
      text: "Click on a code block to copy it to your clipboard.",
    });

    const navBlokContainer = contentEl.createDiv({
      cls: "journal-code-block",
    });
    navBlokContainer.createSpan({
      text: "```calendar-nav",
    });
    navBlokContainer.createEl("br");
    navBlokContainer.createSpan({
      text: "```",
    });

    contentEl.createEl("p", {
      text: "Navigation code block helps navigating relative to current note.",
    });
    contentEl.createEl("p", {
      text: `Navigation code block for ${SECTIONS_MAP[this.granularity]} note looks like this:`,
    });

    const navBlockWrapper = contentEl.createDiv();
    const NavBlock = navBlocks[this.granularity];
    new NavBlock(navBlockWrapper, this.journal, this.journal.today.format("YYYY-MM-DD"), false).display();

    contentEl.createEl("div", {
      cls: "journal-divider",
    });

    const blockContainer = contentEl.createDiv({
      cls: "journal-code-block",
    });
    blockContainer.createSpan({
      text: "```calendar-timeline",
    });
    blockContainer.createEl("br");
    blockContainer.createSpan({
      text: "```",
    });

    if (this.granularity === "day") {
      contentEl.createEl("p", {
        text: "For daily notes timeline blocks helps navigating withing corresponding week.",
      });
    } else {
      contentEl.createEl("p", {
        text: `Timeline code block helps navigating within note's ${this.granularity}.`,
      });
    }
    contentEl.createEl("p", {
      text: `Default timeline for ${SECTIONS_MAP[this.granularity]} note looks like this:`,
    });

    contentEl.createEl("div", {
      cls: "journal-divider",
    });

    const mode = timelineGranularityMapping[this.granularity];
    const Block = timelineModes[mode as keyof typeof timelineModes];
    const wrapper = contentEl.createDiv();
    new Block(wrapper, this.journal, this.journal.today.format("YYYY-MM-DD"), stubMarkdownContext, false).display();

    contentEl.createEl("div", {
      cls: "journal-divider",
    });

    contentEl.createEl("p", {
      text: "You can change default timeline mode by adding mode prop to code block.",
    });

    const blockContainerMode = contentEl.createDiv({
      cls: "journal-code-block",
    });
    blockContainerMode.createSpan({
      text: "```calendar-timeline",
    });
    blockContainerMode.createEl("br");
    blockContainerMode.createSpan({
      text: "mode: week",
    });
    blockContainerMode.createEl("br");
    blockContainerMode.createSpan({
      text: "```",
    });

    contentEl.createEl("p", {
      text: "Supported modes are:",
    });
    const modeList = contentEl.createEl("ul");
    modeList.createEl("li", {
      text: "week",
    });
    modeList.createEl("li", {
      text: "month",
    });
    modeList.createEl("li", {
      text: "quarter",
    });
    modeList.createEl("li", {
      text: "calendar",
    });
  }
}
