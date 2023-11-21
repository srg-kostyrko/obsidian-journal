import { App, Plugin } from "obsidian";
import {
  CalendarConfig,
  CalendarGranularity,
  DailyCalendarSection,
  MonthlyCalendarSection,
  QuarterlyCalendarSection,
  YearlyCalendarSection,
} from "../contracts/config.types";
import { CalendarJournalSection } from "./calendar-journal-section";
import { MomentDate } from "../contracts/date.types";
import { CalendarJournalSectionWeekly } from "./calendar-journal-section-weekly";
import { SECTIONS_MAP } from "../constants";

export const calendarCommands = {
  "calendar:open-daily": "Open daily note",
  "calendar:open-weekly": "Open weekly note",
  "calendar:open-monthly": "Open monthly note",
  "calendar:open-quarterly": "Open quarterly note",
  "calendar:open-yearly": "Open yearly note",
  "calendar:open-daily-next": "Open tomorrow's note",
  "calendar:open-weekly-next": "Open next week note",
  "calendar:open-monthly-next": "Open next month note",
  "calendar:open-quarterly-next": "Open next quarter note",
  "calendar:open-yearly-next": "Open next year note",
  "calendar:open-daily-prev": "Open yesterday's note",
  "calendar:open-weekly-prev": "Open last week note",
  "calendar:open-monthly-prev": "Open last month note",
  "calendar:open-quarterly-prev": "Open last quarter note",
  "calendar:open-yearly-prev": "Open last year note",
};

export class CalendarJournal {
  public readonly daily: CalendarJournalSection<DailyCalendarSection>;
  public readonly weekly: CalendarJournalSectionWeekly;
  public readonly monthly: CalendarJournalSection<MonthlyCalendarSection>;
  public readonly quarterly: CalendarJournalSection<QuarterlyCalendarSection>;
  public readonly yearly: CalendarJournalSection<YearlyCalendarSection>;

  constructor(
    private app: App,
    public readonly config: CalendarConfig,
  ) {
    this.daily = new CalendarJournalSection(app, this, this.config.daily, "day");
    this.weekly = new CalendarJournalSectionWeekly(app, this, this.config.weekly, "week");
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
      case "calendar:open-daily-next":
      case "calendar:open-daily-prev":
        return this.config.daily.enabled;
      case "calendar:open-weekly":
      case "calendar:open-weekly-next":
      case "calendar:open-weekly-prev":
        return this.config.weekly.enabled;
      case "calendar:open-monthly":
      case "calendar:open-monthly-next":
      case "calendar:open-monthly-prev":
        return this.config.monthly.enabled;
      case "calendar:open-quarterly":
      case "calendar:open-quarterly-next":
      case "calendar:open-quarterly-prev":
        return this.config.quarterly.enabled;
      case "calendar:open-yearly":
      case "calendar:open-yearly-next":
      case "calendar:open-yearly-prev":
        return this.config.yearly.enabled;
    }
    return false;
  }

  async execCommand(id: string): Promise<void> {
    switch (id) {
      case "calendar:open-daily-prev":
        return this.daily.openPrev();
      case "calendar:open-daily":
        return this.daily.open();
      case "calendar:open-daily-next":
        return this.daily.openNext();
      case "calendar:open-weekly-prev":
        return this.weekly.openPrev();
      case "calendar:open-weekly":
        return this.weekly.open();
      case "calendar:open-weekly-next":
        return this.weekly.openNext();
      case "calendar:open-monthly-prev":
        return this.monthly.openPrev();
      case "calendar:open-monthly":
        return this.monthly.open();
      case "calendar:open-monthly-next":
        return this.monthly.openNext();
      case "calendar:open-quarterly-prev":
        return this.quarterly.openPrev();
      case "calendar:open-quarterly":
        return this.quarterly.open();
      case "calendar:open-quarterly-next":
        return this.quarterly.openNext();
      case "calendar:open-yearly-prev":
        return this.yearly.openPrev();
      case "calendar:open-yearly":
        return this.yearly.open();
      case "calendar:open-yearly-next":
        return this.yearly.openNext();
    }
  }

  configureRibbonIcons(plugin: Plugin) {
    this.daily.configureRibbonIcons(plugin);
    this.weekly.configureRibbonIcons(plugin);
    this.monthly.configureRibbonIcons(plugin);
    this.quarterly.configureRibbonIcons(plugin);
    this.yearly.configureRibbonIcons(plugin);
  }

  async openStartupNote(): Promise<void> {
    if (!this.config.openOnStartup) return;
    const section = this.config.startupSection;
    await this[section].open();
  }

  async openDefault(): Promise<void> {
    if (this.config.daily.enabled) {
      return this.daily.open();
    } else if (this.config.weekly.enabled) {
      return this.weekly.open();
    } else if (this.config.monthly.enabled) {
      return this.monthly.open();
    } else if (this.config.quarterly.enabled) {
      return this.quarterly.open();
    }
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
