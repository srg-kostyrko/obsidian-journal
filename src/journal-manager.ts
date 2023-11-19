import { App, Component, TAbstractFile, TFile, moment } from "obsidian";
import { JournalConfig } from "./config/journal-config";
import { CalendarJournal } from "./calendar-journal/calendar-journal";
import { FRONTMATTER_DATE_KEY, FRONTMATTER_ID_KEY, FRONTMATTER_META_KEY } from "./constants";

export class JournalManager extends Component {
  private journals = new Map<string, CalendarJournal>();
  private defaultId: string;

  constructor(
    private app: App,
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
      console.log(journal, date, meta);
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
