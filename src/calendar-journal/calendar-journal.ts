import { App } from "obsidian";
import {
  CalendarConfig,
  CalendarGranularity,
  DailyCalendarSection,
  MonthlyCalendarSection,
  QuarterlyCalendarSection,
  SectionName,
  WeeklyCalendarSection,
  YearlyCalendarSection,
} from "../contracts/config.types";
import { CalendarJournalSection } from "./calendar-journal-section";
import { MomentDate } from "../contracts/date.types";

const SECTIONS_MAP: Record<CalendarGranularity, SectionName> = {
  day: "daily",
  week: "weekly",
  month: "monthly",

  quarter: "quarterly",
  year: "yearly",
};

export const calendarCommands = {
  "calendar:open-daily": "Open daily note",
  "calendar:open-weekly": "Open weekly note",
  "calendar:open-monthly": "Open monthly note",
  "calendar:open-quarterly": "Open quarterly note",
  "calendar:open-yearly": "Open yearly note",
};

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

  supportsCommand(id: string): boolean {
    switch (id) {
      case "calendar:open-daily":
        return this.config.daily.enabled;
      case "calendar:open-weekly":
        return this.config.weekly.enabled;
      case "calendar:open-monthly":
        return this.config.monthly.enabled;
      case "calendar:open-quarterly":
        return this.config.quarterly.enabled;
      case "calendar:open-yearly":
        return this.config.yearly.enabled;
    }
    return false;
  }

  async execCommand(id: string): Promise<void> {
    switch (id) {
      case "calendar:open-daily":
        return this.daily.open();
      case "calendar:open-weekly":
        return this.weekly.open();
      case "calendar:open-monthly":
        return this.monthly.open();
      case "calendar:open-quarterly":
        return this.quarterly.open();
      case "calendar:open-yearly":
        return this.yearly.open();
    }
  }

  async openStartupNote(): Promise<void> {
    if (!this.config.openOnStartup) return;
    const section = this.config.startupSection;
    await this[section].open();
  }

  indexNote(date: MomentDate, payload: [string], path: string): void {
    const [granularity] = payload;
    const section = SECTIONS_MAP[granularity as CalendarGranularity];
    if (!section) return;
    this[section].indexNote(date, path);
  }

  clearForPath(path: string): void {
    this.daily.clearForPath(path);
    this.weekly.clearForPath(path);
    this.monthly.clearForPath(path);
    this.quarterly.clearForPath(path);
    this.yearly.clearForPath(path);
  }
}
