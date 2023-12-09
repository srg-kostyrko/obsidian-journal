import { App, FrontMatterCache, Plugin, TFile } from "obsidian";
import { CalendarConfig, CalendarGranularity, CalerndatFrontMatter } from "../contracts/config.types";
import { CalendarJournalSection } from "./calendar-journal-section";
import {
  FRONTMATTER_DATE_FORMAT,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_ID_KEY,
  FRONTMATTER_SECTION_KEY,
  FRONTMATTER_START_DATE_KEY,
} from "../constants";
import { CalendarIndex } from "./calendar-index";
import { CalendarHelper } from "../utils/calendar";
import { MomentDate } from "../contracts/date.types";
import { Journal } from "../contracts/journal.types";

export const calendarCommands = {
  "calendar:open-daily": "Open today's note",
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

export class CalendarJournal implements Journal {
  public readonly daily: CalendarJournalSection;
  public readonly weekly: CalendarJournalSection;
  public readonly monthly: CalendarJournalSection;
  public readonly quarterly: CalendarJournalSection;
  public readonly yearly: CalendarJournalSection;

  public readonly index = new CalendarIndex();

  constructor(
    private app: App,
    public readonly config: CalendarConfig,
    private calendar: CalendarHelper,
  ) {
    this.daily = new CalendarJournalSection(app, this, this.config.daily, "day", this.calendar);
    this.weekly = new CalendarJournalSection(app, this, this.config.weekly, "week", this.calendar);
    this.monthly = new CalendarJournalSection(app, this, this.config.monthly, "month", this.calendar);
    this.quarterly = new CalendarJournalSection(app, this, this.config.quarterly, "quarter", this.calendar);
    this.yearly = new CalendarJournalSection(app, this, this.config.yearly, "year", this.calendar);
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get today(): MomentDate {
    return this.calendar.today();
  }

  date(date?: string, format?: string): MomentDate {
    return this.calendar.date(date, format);
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

  async autoCreateNotes(): Promise<void> {
    await this.daily.autoCreateNote();
    await this.weekly.autoCreateNote();
    await this.monthly.autoCreateNote();
    await this.quarterly.autoCreateNote();
    await this.yearly.autoCreateNote();
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

  parseFrontMatter(frontmatter: FrontMatterCache): CalerndatFrontMatter {
    return {
      type: "calendar",
      id: this.id,
      start_date: frontmatter[FRONTMATTER_START_DATE_KEY],
      end_date: frontmatter[FRONTMATTER_END_DATE_KEY],
      granularity: frontmatter[FRONTMATTER_SECTION_KEY] as CalendarGranularity,
    };
  }

  indexNote(frontmatter: CalerndatFrontMatter, path: string): void {
    const startDate = this.calendar.date(frontmatter.start_date, FRONTMATTER_DATE_FORMAT);
    const endDate = this.calendar.date(frontmatter.end_date, FRONTMATTER_DATE_FORMAT);
    this.index.add(startDate, endDate, { path, granularity: frontmatter.granularity });
  }

  clearForPath(path: string): void {
    this.index.clearForPath(path);
  }

  async clearNotes(): Promise<void> {
    const proomises = [];
    for (const entry of this.index) {
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (!file) continue;
      proomises.push(
        new Promise<void>((resolve) => {
          this.app.fileManager.processFrontMatter(file as TFile, (frontmatter) => {
            delete frontmatter[FRONTMATTER_ID_KEY];
            delete frontmatter[FRONTMATTER_START_DATE_KEY];
            delete frontmatter[FRONTMATTER_END_DATE_KEY];
            delete frontmatter[FRONTMATTER_SECTION_KEY];
            resolve();
          });
        }),
      );
    }
    await Promise.allSettled(proomises);
  }

  async deleteNotes(): Promise<void> {
    const proomises = [];
    for (const entry of this.index) {
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (!file) continue;
      proomises.push(this.app.vault.delete(file));
    }
    await Promise.allSettled(proomises);
  }
}
