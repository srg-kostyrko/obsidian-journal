import { MarkdownRenderChild } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { JournalManager } from "../journal-manager";
import { JournalSuggestModal } from "../ui/journal-suggest-modal";

export class CodeBlockHome extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    protected manager: JournalManager,
    protected defaultJournal?: CalendarJournal,
  ) {
    super(containerEl);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    const view = containerEl.createDiv({
      cls: "journal-home-view",
    });

    this.createTodayLink(view);
    this.createWeekLink(view);
  }

  private createTodayLink(parent: HTMLElement) {
    const journals = this.manager.getByType("calendar").filter((j) => j.config.day.enabled);
    if (journals.length === 0) return;

    const todayLink = parent.createSpan({
      cls: "journal-home-link journal-clickable today-link",
      text: "Today's Note",
    });

    parent.createSpan({
      text: " • ",
    });
    todayLink.dataset.date = this.manager.calendar.today().format("YYYY-MM-DD");

    parent.on("click", ".today-link", (_e, _target) => {
      if (this.defaultJournal?.config.day.enabled) {
        this.defaultJournal.day.open();
      } else if (journals.length === 1) {
        (journals[0] as CalendarJournal).day.open();
      } else {
        new JournalSuggestModal(this.manager.app, journals, (journal) => {
          (journal as CalendarJournal).day.open();
        }).open();
      }
    });
  }

  private createWeekLink(parent: HTMLElement) {
    const journals = this.manager.getByType("calendar").filter((j) => j.config.week.enabled);
    if (journals.length === 0) return;

    const weekLink = parent.createSpan({
      cls: "journal-home-link journal-clickable week-link",
      text: "This Week's Note",
    });

    weekLink.dataset.date = this.manager.calendar.today().format("YYYY-MM-DD");

    parent.on("click", ".week-link", (_e, _target) => {
      if (this.defaultJournal?.config.week.enabled) {
        this.defaultJournal.week.open();
      } else if (journals.length === 1) {
        (journals[0] as CalendarJournal).week.open();
      } else {
        new JournalSuggestModal(this.manager.app, journals, (journal) => {
          (journal as CalendarJournal).week.open();
        }).open();
      }
    });
  }
}
