import { App } from "obsidian";
import { CalendarConfig, DailyCalendarSection } from "./contracts/config.types";
import { CalendarJournalSection } from "./calendar-journal-section";

export class CalendarJournal {
  public readonly daily: CalendarJournalSection<DailyCalendarSection>;
  constructor(
    private app: App,
    public readonly config: CalendarConfig,
  ) {
    this.daily = new CalendarJournalSection(app, this, this.config.daily, "day");
  }

  get id(): string {
    return this.config.id;
  }
}
