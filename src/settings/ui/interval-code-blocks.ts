import { App, Modal } from "obsidian";
import { IntervalJournal } from "../../interval-journal/interval-journal";
import { IntervalConfig } from "../../contracts/config.types";
import { CalendarHelper } from "../../utils/calendar";
import { CodeBlockIntervalNav } from "../../code-block-interval/code-block-interval";

export class IntervalCodeBlocksModal extends Modal {
  private journal: IntervalJournal;
  constructor(
    app: App,
    config: IntervalConfig,
    private calendar: CalendarHelper,
  ) {
    super(app);
    this.journal = new IntervalJournal(app, config, calendar);
  }

  onOpen(): void {
    this.titleEl.innerText = "Interval code blocks";
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
      text: "```interval-nav",
    });
    navBlokContainer.createEl("br");
    navBlokContainer.createSpan({
      text: "```",
    });
    contentEl.createEl("p", {
      text: "Interval navigation code block helps navigating relative to current note.",
    });
    contentEl.createEl("p", {
      text: "For current config it will look like this:",
    });

    const blockWrapper = contentEl.createDiv();
    new CodeBlockIntervalNav(blockWrapper, this.journal, this.calendar.today().format("YYYY-MM-DD"), false).display();
  }
}
