import { App, FrontMatterCache, Plugin, TFile } from "obsidian";
import { CalendarConfig, CalendarGranularity, CalendarFrontMatter } from "../contracts/config.types";
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
  "calendar:open-day": "Open today's note",
  "calendar:open-week": "Open weekly note",
  "calendar:open-month": "Open monthly note",
  "calendar:open-quarter": "Open quarterly note",
  "calendar:open-year": "Open yearly note",
  "calendar:open-next-day": "Open tomorrow's note",
  "calendar:open-next-week": "Open next week note",
  "calendar:open-next-month": "Open next month note",
  "calendar:open-next-quarter": "Open next quarter note",
  "calendar:open-next-year": "Open next year note",
  "calendar:open-prev-day": "Open yesterday's note",
  "calendar:open-prev-week": "Open last week note",
  "calendar:open-prev-month": "Open last month note",
  "calendar:open-prev-quarter": "Open last quarter note",
  "calendar:open-prev-year": "Open last year note",
};

export class CalendarJournal implements Journal {
  public readonly day: CalendarJournalSection;
  public readonly week: CalendarJournalSection;
  public readonly month: CalendarJournalSection;
  public readonly quarter: CalendarJournalSection;
  public readonly year: CalendarJournalSection;

  public readonly index = new CalendarIndex();

  constructor(
    private app: App,
    public readonly config: CalendarConfig,
    private calendar: CalendarHelper,
  ) {
    this.day = new CalendarJournalSection(app, this, this.config.day, "day", this.calendar);
    this.week = new CalendarJournalSection(app, this, this.config.week, "week", this.calendar);
    this.month = new CalendarJournalSection(app, this, this.config.month, "month", this.calendar);
    this.quarter = new CalendarJournalSection(app, this, this.config.quarter, "quarter", this.calendar);
    this.year = new CalendarJournalSection(app, this, this.config.year, "year", this.calendar);
  }

  get id(): string {
    return this.config.id;
  }

  get type(): "calendar" {
    return "calendar";
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

  supportsCommand(id: keyof typeof calendarCommands): boolean {
    switch (id) {
      case "calendar:open-day":
      case "calendar:open-next-day":
      case "calendar:open-prev-day":
        return this.config.day.enabled;
      case "calendar:open-week":
      case "calendar:open-next-week":
      case "calendar:open-prev-week":
        return this.config.week.enabled;
      case "calendar:open-month":
      case "calendar:open-next-month":
      case "calendar:open-prev-month":
        return this.config.month.enabled;
      case "calendar:open-quarter":
      case "calendar:open-next-quarter":
      case "calendar:open-prev-quarter":
        return this.config.quarter.enabled;
      case "calendar:open-year":
      case "calendar:open-next-year":
      case "calendar:open-prev-year":
        return this.config.year.enabled;
    }
    return false;
  }

  async execCommand(id: keyof typeof calendarCommands): Promise<void> {
    switch (id) {
      case "calendar:open-prev-day":
        return this.day.openPrev();
      case "calendar:open-day":
        return this.day.open();
      case "calendar:open-next-day":
        return this.day.openNext();
      case "calendar:open-prev-week":
        return this.week.openPrev();
      case "calendar:open-week":
        return this.week.open();
      case "calendar:open-next-week":
        return this.week.openNext();
      case "calendar:open-prev-month":
        return this.month.openPrev();
      case "calendar:open-month":
        return this.month.open();
      case "calendar:open-next-month":
        return this.month.openNext();
      case "calendar:open-prev-quarter":
        return this.quarter.openPrev();
      case "calendar:open-quarter":
        return this.quarter.open();
      case "calendar:open-next-quarter":
        return this.quarter.openNext();
      case "calendar:open-prev-year":
        return this.year.openPrev();
      case "calendar:open-year":
        return this.year.open();
      case "calendar:open-next-year":
        return this.year.openNext();
    }
  }

  configureRibbonIcons(plugin: Plugin) {
    this.day.configureRibbonIcons(plugin);
    this.week.configureRibbonIcons(plugin);
    this.month.configureRibbonIcons(plugin);
    this.quarter.configureRibbonIcons(plugin);
    this.year.configureRibbonIcons(plugin);
  }

  async autoCreateNotes(): Promise<void> {
    await this.day.autoCreateNote();
    await this.week.autoCreateNote();
    await this.month.autoCreateNote();
    await this.quarter.autoCreateNote();
    await this.year.autoCreateNote();
  }

  async findNextNote(data: CalendarFrontMatter): Promise<string | null> {
    return this.index.findNextNote(this.calendar.date(data.end_date).add(1, "day").startOf("day"), data.granularity);
  }
  async findPreviousNote(data: CalendarFrontMatter): Promise<string | null> {
    return this.index.findPreviousNote(
      this.calendar.date(data.start_date).subtract(1, "day").endOf("day"),
      data.granularity,
    );
  }

  async openStartupNote(): Promise<void> {
    if (!this.config.openOnStartup || !this.config.startupSection) return;
    const section = this.config.startupSection;
    await this[section].open();
  }

  async openPath(path: string, frontmatter: CalendarFrontMatter): Promise<void> {
    const section = frontmatter.granularity;
    await this[section].openPath(path);
  }

  parseFrontMatter(frontmatter: FrontMatterCache): CalendarFrontMatter {
    return {
      type: "calendar",
      id: this.id,
      start_date: frontmatter[FRONTMATTER_START_DATE_KEY],
      end_date: frontmatter[FRONTMATTER_END_DATE_KEY],
      granularity: frontmatter[FRONTMATTER_SECTION_KEY] as CalendarGranularity,
    };
  }

  indexNote(frontmatter: CalendarFrontMatter, path: string): void {
    const startDate = this.calendar.date(frontmatter.start_date, FRONTMATTER_DATE_FORMAT);
    const endDate = this.calendar.date(frontmatter.end_date, FRONTMATTER_DATE_FORMAT);
    this.index.add(startDate, endDate, {
      path,
      granularity: frontmatter.granularity,
      startDate: frontmatter.start_date,
      endDate: frontmatter.end_date,
    });
  }

  clearForPath(path: string): void {
    this.index.clearForPath(path);
  }

  async disconnectNote(path: string): Promise<void> {
    this.clearForPath(path);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    if (!(file instanceof TFile)) return;
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      delete frontmatter[FRONTMATTER_ID_KEY];
      delete frontmatter[FRONTMATTER_START_DATE_KEY];
      delete frontmatter[FRONTMATTER_END_DATE_KEY];
      delete frontmatter[FRONTMATTER_SECTION_KEY];
    });
  }

  async clearNotes(): Promise<void> {
    const promises = [];
    for (const entry of this.index) {
      promises.push(this.disconnectNote(entry.path));
    }
    await Promise.allSettled(promises);
  }

  async deleteNotes(): Promise<void> {
    const promises = [];
    for (const entry of this.index) {
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (!file) continue;
      promises.push(this.app.vault.delete(file));
    }
    await Promise.allSettled(promises);
  }
}
