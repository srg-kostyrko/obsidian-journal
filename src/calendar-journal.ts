import { App } from "obsidian";
import {
  CalendarConfig,
  DailyCalendarSection,
  MonthlyCalendarSection,
  QuarterlyCalendarSection,
  WeeklyCalendarSection,
  YearlyCalendarSection,
} from "./contracts/config.types";
import { CalendarJournalSection } from "./calendar-journal-section";

export class CalendarJournal {
  public readonly daily: CalendarJournalSection<DailyCalendarSection>;
  public readonly weekly: CalendarJournalSection<WeeklyCalendarSection>;
  public readonly monthly: CalendarJournalSection<MonthlyCalendarSection>;
  public readonly quarterly: CalendarJournalSection<QuarterlyCalendarSection>;
  public readonly yearly: CalendarJournalSection<YearlyCalendarSection>;

  constructor(
    private app: App,
    public readonly config: CalendarConfig,
  ) {
    this.daily = new CalendarJournalSection(app, this, this.config.daily, "day");
    this.weekly = new CalendarJournalSection(app, this, this.config.weekly, "week");
    this.monthly = new CalendarJournalSection(app, this, this.config.monthly, "month");
    this.quarterly = new CalendarJournalSection(app, this, this.config.quarterly, "quarter");
    this.yearly = new CalendarJournalSection(app, this, this.config.yearly, "year");
  }

  get id(): string {
    return this.config.id;
  }

  openStartupNote(): void {
    if (!this.config.openOnStartup) return;
    const section = this.config.startupSection;
    this[section].open();
  }
}
