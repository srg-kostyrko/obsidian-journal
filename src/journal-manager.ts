import { App, Component, Plugin, TAbstractFile, TFile, moment } from "obsidian";
import { JournalConfig } from "./config/journal-config";
import { CalendarJournal, calendarCommands } from "./calendar-journal/calendar-journal";
import { FRONTMATTER_DATE_KEY, FRONTMATTER_ID_KEY, FRONTMATTER_META_KEY } from "./constants";

export class JournalManager extends Component {
  private journals = new Map<string, CalendarJournal>();
  private defaultId: string;

  private knownCommands = new Set();

  constructor(
    private app: App,
    private plugin: Plugin,
    private config: JournalConfig,
  ) {
    super();
    for (const [journalConfig] of config) {
      switch (journalConfig.type) {
        case "calendar": {
          const calendar = new CalendarJournal(this.app, journalConfig);
          this.journals.set(journalConfig.id, calendar);
          if (journalConfig.isDefault) {
            this.defaultId = journalConfig.id;
          }
          break;
        }
        default:
          console.warn(`${journalConfig.type} journals not supported`);
      }
    }
  }

  get defaultJournal() {
    return this.journals.get(this.defaultId);
  }

  async openStartupNote(): Promise<void> {
    await this.defaultJournal?.openStartupNote();
  }

  configureCommands() {
    this.configureCalendarCommands();
  }

  private configureCalendarCommands(): void {
    for (const [id, label] of Object.entries(calendarCommands)) {
      this.plugin.addCommand({
        id: `journal:${id}`,
        name: label,
        checkCallback: (checking: boolean): boolean => {
          const calendars = this.getCalendarsSupportingCommand(id);
          if (calendars.length > 0) {
            if (!checking) {
              this.execCalendarCommand(id, calendars);
            }
            return true;
          }
          return false;
        },
      });
    }
  }

  private getCalendarsSupportingCommand(id: string) {
    const journals: CalendarJournal[] = [];
    for (const journal of this.journals.values()) {
      if (journal instanceof CalendarJournal && journal.supportsCommand(id)) {
        journals.push(journal);
      }
    }
    return journals;
  }

  private execCalendarCommand(id: string, calendars: CalendarJournal[]) {
    if (calendars.length === 1) {
      const [calendar] = calendars;
      calendar.execCommand(id);
    } else {
      // TODO add journal selector
    }
  }

  async reindex(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      this.indexFile(file);
    }
    this.setupListeners();
  }

  indexFile(file: TFile): void {
    const metadata = this.app.metadataCache.getFileCache(file);
    if (!metadata) return;
    const { frontmatter } = metadata;
    if (!frontmatter) return;
    if (FRONTMATTER_ID_KEY in frontmatter) {
      const id = frontmatter[FRONTMATTER_ID_KEY];
      const journal = this.journals.get(id);
      if (!journal) return;
      const date = moment(frontmatter[FRONTMATTER_DATE_KEY]);
      const meta = frontmatter[FRONTMATTER_META_KEY];
      journal.indexNote(date, meta, file.path);
    }
  }

  clearForPath(path: string): void {
    for (const journal of this.journals.values()) {
      journal.clearForPath(path);
    }
  }

  private setupListeners() {
    this.registerEvent(this.app.vault.on("rename", this.onRenamed, this));
    this.registerEvent(this.app.metadataCache.on("changed", this.onMetadataChanged, this));
  }

  onRenamed = (file: TAbstractFile, oldPath: string) => {
    if (file instanceof TFile) {
      this.clearForPath(oldPath);
      this.indexFile(file);
    }
  };

  onMetadataChanged = (file: TFile) => {
    this.clearForPath(file.path);
    this.indexFile(file);
  };
}
