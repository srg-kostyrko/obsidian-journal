import { App, Component, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { CalendarJournal, calendarCommands } from "./calendar-journal/calendar-journal";
import { FRONTMATTER_ID_KEY } from "./constants";
import { deepCopy } from "./utils";
import { DEFAULT_CONFIG_CALENDAR } from "./config/config-defaults";
import { CalendarConfig, IntervalConfig, JournalFrontMatter } from "./contracts/config.types";
import { JournalSuggestModal } from "./ui/journal-suggest-modal";
import { JournalConfigManager } from "./config/journal-config-manager";
import { CalendarHelper } from "./utils/calendar";
import { IntervalJournal, intervalCommands } from "./interval-journal/interval-journal";
import { Journal, NotesProcessing } from "./contracts/journal.types";

export class JournalManager extends Component {
  private journals = new Map<string, Journal>();
  private fileFrontMatters = new Map<string, JournalFrontMatter | null>();

  public readonly calendar: CalendarHelper;

  constructor(
    private app: App,
    private plugin: Plugin,
    private config: JournalConfigManager,
  ) {
    super();
    this.calendar = new CalendarHelper(this.config.calendar);
    for (const journalConfig of config) {
      switch (journalConfig.type) {
        case "calendar": {
          const calendar = new CalendarJournal(this.app, journalConfig, this.calendar);
          this.journals.set(journalConfig.id, calendar);
          break;
        }
        case "interval": {
          const interval = new IntervalJournal(this.app, journalConfig, this.calendar);
          this.journals.set(journalConfig.id, interval);
          break;
        }
      }
    }
  }

  get(id: string): Journal | undefined {
    return this.journals.get(id);
  }

  async createCalendarJournal(id: string, name: string): Promise<string> {
    const config: CalendarConfig = {
      ...deepCopy(DEFAULT_CONFIG_CALENDAR),
      id,
      name,
    };
    this.config.add(config);
    await this.config.save();
    const calendar = new CalendarJournal(this.app, config, this.calendar);
    this.journals.set(id, calendar);
    return id;
  }

  async createIntervalJournal(config: IntervalConfig): Promise<string> {
    const id = config.id;
    this.config.add(config);
    await this.config.save();
    const calendar = new IntervalJournal(this.app, config, this.calendar);
    this.journals.set(id, calendar);
    return id;
  }

  async autoCreateNotes(): Promise<void> {
    for (const journal of this.journals.values()) {
      await journal.autoCreateNotes();
    }
  }

  async openStartupNote(): Promise<void> {
    for (const journal of this.journals.values()) {
      await journal.openStartupNote();
    }
  }

  configureCommands() {
    for (const [id, label] of Object.entries({ ...intervalCommands, ...calendarCommands })) {
      this.plugin.addCommand({
        id: `journal:${id}`,
        name: label,
        checkCallback: (checking: boolean): boolean => {
          const journals = this.getJournalsSupportingCommand(id);
          if (journals.length > 0) {
            if (!checking) {
              this.execCommand(id, journals);
            }
            return true;
          }
          return false;
        },
      });
    }
    this.plugin.addCommand({
      id: "journal:open-next",
      name: "Open next note",
      editorCallback: async (editor, ctx) => {
        const file = ctx.file;
        if (file) {
          const data = await this.getJournalData(file.path);
          if (data) {
            const journal = this.journals.get(data.id);
            if (journal) {
              const notePath = await journal.findNextNote(data);
              if (notePath) {
                await journal.openPath(notePath, data);
              } else {
                new Notice("There is no next note after this one.");
              }
            } else {
              new Notice("Unknown journal id.");
            }
          } else {
            new Notice("This note is not connected to any journal.");
          }
        }
      },
    });
    this.plugin.addCommand({
      id: "journal:open-prev",
      name: "Open previous note",
      editorCallback: async (editor, ctx) => {
        const file = ctx.file;
        if (file) {
          const data = await this.getJournalData(file.path);
          if (data) {
            const journal = this.journals.get(data.id);
            if (journal) {
              const notePath = await journal.findPreviousNote(data);
              if (notePath) {
                await journal.openPath(notePath, data);
              } else {
                new Notice("There is no previous note before this one.");
              }
            } else {
              new Notice("Unknown journal id.");
            }
          } else {
            new Notice("This note is not connected to any journal.");
          }
        }
      },
    });
  }

  configureRibbonIcons() {
    for (const journal of this.journals.values()) {
      journal.configureRibbonIcons(this.plugin);
    }
  }

  private getJournalsSupportingCommand(id: string): Journal[] {
    const journals: Journal[] = [];
    for (const journal of this.journals.values()) {
      if (journal.supportsCommand(id)) {
        journals.push(journal);
      }
    }
    return journals;
  }

  private execCommand(id: string, journals: Journal[]) {
    if (journals.length === 1) {
      const [calendar] = journals;
      calendar.execCommand(id);
    } else {
      new JournalSuggestModal(this.app, journals, (calendar: Journal) => {
        calendar.execCommand(id);
      }).open();
    }
  }

  async reindex(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      this.indexFile(file);
    }
    this.setupListeners();
  }

  async getJournalData(path: string): Promise<JournalFrontMatter | null> {
    if (this.fileFrontMatters.has(path)) {
      return this.fileFrontMatters.get(path) ?? null;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const metadata = this.app.metadataCache.getFileCache(file);
      if (metadata) {
        const { frontmatter } = metadata;
        if (frontmatter && FRONTMATTER_ID_KEY in frontmatter) {
          const id = frontmatter[FRONTMATTER_ID_KEY];
          const journal = this.journals.get(id);
          if (journal) {
            const data = journal.parseFrontMatter(frontmatter);
            this.fileFrontMatters.set(path, data);
            return data;
          }
        }
      }
    }
    this.fileFrontMatters.set(path, null);
    return null;
  }

  async indexFile(file: TFile): Promise<void> {
    const data = await this.getJournalData(file.path);
    if (data) {
      const journal = this.journals.get(data.id);
      if (journal) {
        journal.indexNote(data, file.path);
      }
    }
  }

  clearForPath(path: string): void {
    this.fileFrontMatters.delete(path);
    for (const journal of this.journals.values()) {
      journal.clearForPath(path);
    }
  }

  private setupListeners() {
    this.registerEvent(this.app.vault.on("rename", this.onRenamed, this));
    this.registerEvent(this.app.vault.on("delete", this.onDeleted, this));
    this.registerEvent(this.app.metadataCache.on("changed", this.onMetadataChanged, this));
  }

  onRenamed = (file: TAbstractFile, oldPath: string) => {
    if (file instanceof TFile) {
      this.clearForPath(oldPath);
      this.indexFile(file);
    }
  };

  onDeleted = (file: TAbstractFile) => {
    if (file instanceof TFile) {
      this.clearForPath(file.path);
    }
  };

  onMetadataChanged = (file: TFile) => {
    this.clearForPath(file.path);
    this.indexFile(file);
  };

  async deleteJournal(id: string, notesProcessing: NotesProcessing): Promise<void> {
    const journal = this.journals.get(id);
    if (journal) {
      switch (notesProcessing) {
        case "clear":
          await journal.clearNotes();
          break;
        case "delete":
          await journal.deleteNotes();
          break;
      }
      this.journals.delete(id);
      this.config.delete(id);
      await this.config.save();
    }
  }
}
