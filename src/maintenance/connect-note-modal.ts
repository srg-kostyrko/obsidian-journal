import { App, Modal, Setting, TFile } from "obsidian";
import { JournalManager } from "../journal-manager";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { IntervalJournal } from "../interval-journal/interval-journal";
import { SECTIONS_MAP } from "../constants";
import { CalendarGranularity, JournalFrontMatter } from "../contracts/config.types";
import { DatePickerModal } from "../ui/date-picker-modal";
import { Interval } from "../interval-journal/interval-manager";

export class ConnectNoteModal extends Modal {
  private journalFrontMatter: JournalFrontMatter | null = null;
  private journalId: string | null = null;

  private calendarType: CalendarGranularity | undefined;

  private date: string | undefined;
  private interval: Interval | undefined;

  private override = false;
  private rename = false;
  private move = false;

  constructor(
    app: App,
    private manager: JournalManager,
    private file: TFile,
  ) {
    super(app);
    this.readFrontMatter();
  }

  async readFrontMatter() {
    this.journalFrontMatter = await this.manager.getJournalData(this.file.path);
    if (this.journalFrontMatter) {
      this.display();
    }
  }

  onOpen(): void {
    this.display();
    this.titleEl.setText("Connect note to a journal");
  }

  clearSelections(): void {
    this.journalId = null;
    this.calendarType = undefined;
    this.date = undefined;
    this.interval = undefined;
    this.override = false;
    this.rename = false;
    this.move = false;
  }

  display(): void {
    const { contentEl } = this;
    contentEl.empty();

    if (this.journalFrontMatter) {
      this.renderConnectedNote();
      return;
    }

    new Setting(contentEl).setName("Select journal").addDropdown((dropdown) => {
      const journals = Object.entries(this.manager.getAll());
      journals.sort((a, b) => a[1].name.localeCompare(b[1].name));
      const options: Record<string, string> = {};
      if (journals.length > 1) {
        options[""] = "";
      } else {
        this.journalId = journals[0][0];
      }
      for (const [id, journal] of journals) {
        options[id] = journal.name;
      }
      dropdown.addOptions(options);
      if (this.journalId) dropdown.setValue(this.journalId);
      dropdown.onChange((value) => {
        this.clearSelections();
        this.journalId = value;
        this.display();
      });
    });

    if (this.journalId) {
      this.renderJournalSettings(this.journalId);
    }
  }

  private renderJournalSettings(id: string) {
    const journal = this.manager.get(id);
    if (!journal) return;
    if (journal.type === "calendar") {
      this.renderCalendarJournalSettings(journal as CalendarJournal);
    } else if (journal.type === "interval") {
      this.renderIntervalJournalSettings(journal as IntervalJournal);
    }
  }

  private renderCalendarJournalSettings(journal: CalendarJournal) {
    const { contentEl } = this;
    new Setting(contentEl).setName("Note type").addDropdown((dropdown) => {
      const options: Record<string, string> = {
        "": "",
      };
      for (const [granularity, name] of Object.entries(SECTIONS_MAP)) {
        if (journal.config[granularity as CalendarGranularity].enabled) {
          options[granularity] = name;
        }
      }
      if (Object.keys(options).length === 2) {
        delete options[""];
        this.calendarType = Object.keys(options)[0] as CalendarGranularity;
      }
      dropdown.addOptions(options);
      if (this.calendarType && journal.config[this.calendarType].enabled) {
        dropdown.setValue(this.calendarType);
      } else {
        this.calendarType = undefined;
      }
      dropdown.onChange((value) => {
        this.calendarType = value as CalendarGranularity;
        this.date = undefined;
        this.display();
      });
    });
    const type = this.calendarType;
    if (type) {
      new Setting(contentEl).setName("Date").addButton((button) => {
        const buttonText = this.date
          ? this.manager.calendar.date(this.date).format(journal[type].dateFormat)
          : "Pick date";
        button.setButtonText(buttonText).onClick(() => {
          new DatePickerModal(
            this.app,
            this.manager,
            (date: string) => {
              this.date = date;
              this.override = false;
              this.rename = false;
              this.move = false;
              this.display();
            },
            this.date,
            this.calendarType,
          ).open();
        });
      });
    }

    if (this.date && this.calendarType) {
      const section = journal[this.calendarType];
      const rangeStart = section.getRangeStart(this.date);
      const rangeEnd = section.getRangeEnd(this.date);
      const indexed = journal.index.get(rangeStart, this.calendarType);
      if (indexed) {
        const overrideEl = new Setting(contentEl).setName("Override").addToggle((toggle) => {
          toggle.setValue(this.override).onChange((value) => {
            this.override = value;
            this.display();
          });
        });
        overrideEl.descEl.createSpan({
          text: "Other note ",
        });
        overrideEl.descEl.createEl("b", {
          cls: "u-pop",
          text: indexed.path,
        });
        overrideEl.descEl.createSpan({
          text: " is connected to this date",
        });
      }

      if (!indexed || this.override) {
        const expectedName = section.getDateFilename(rangeStart, rangeEnd);
        if (expectedName !== this.file.name) {
          const renameEl = new Setting(contentEl).setName("Rename").addToggle((toggle) => {
            toggle.setValue(this.rename).onChange((value) => {
              this.rename = value;
            });
          });
          renameEl.descEl.createSpan({
            text: "Note name ",
          });
          renameEl.descEl.createEl("b", {
            cls: "u-pop",
            text: this.file.name,
          });
          renameEl.descEl.createSpan({
            text: " differs from journal note name config: ",
          });
          renameEl.descEl.createEl("b", {
            cls: "u-pop",
            text: expectedName,
          });
        }

        const expectedFolder = section.getDateFolder(rangeStart, rangeEnd) || "/";
        if (expectedFolder !== this.file.parent?.path) {
          const moveEl = new Setting(contentEl).setName("Move").addToggle((toggle) => {
            toggle.setValue(this.move).onChange((value) => {
              this.move = value;
            });
          });

          moveEl.descEl.createSpan({
            text: "Note folder ",
          });
          moveEl.descEl.createEl("b", {
            cls: "u-pop",
            text: this.file.parent?.path ?? "/",
          });
          moveEl.descEl.createSpan({
            text: " differs from journal folder path config: ",
          });
          moveEl.descEl.createEl("b", {
            cls: "u-pop",
            text: expectedFolder,
          });
        }

        new Setting(contentEl).addButton((button) => {
          button
            .setButtonText("Connect")
            .setCta()
            .onClick(async () => {
              await section.connectNote(this.file, rangeStart, rangeEnd, {
                override: this.override,
                rename: this.rename,
                move: this.move,
              });
              this.close();
            });
        });
      }
    }
  }

  private renderIntervalJournalSettings(journal: IntervalJournal) {
    const { contentEl } = this;

    new Setting(contentEl).setName("Interval").addButton((button) => {
      const buttonText = this.interval ? journal.getIntervalFileName(this.interval) : "Pick any date in interval";
      button.setButtonText(buttonText).onClick(() => {
        new DatePickerModal(
          this.app,
          this.manager,
          (date: string) => {
            this.interval = journal.findInterval(date);
            this.override = false;
            this.rename = false;
            this.move = false;
            this.display();
          },
          this.interval ? this.interval.startDate.format("YYYY-MM-DD") : undefined,
        ).open();
      });
    });
    const interval = this.interval;
    if (interval) {
      if (interval.path) {
        const overrideEl = new Setting(contentEl).setName("Override").addToggle((toggle) => {
          toggle.setValue(this.override).onChange((value) => {
            this.override = value;
          });
        });
        overrideEl.descEl.createSpan({
          text: "Other note ",
        });
        overrideEl.descEl.createEl("b", {
          cls: "u-pop",
          text: interval.path,
        });
        overrideEl.descEl.createSpan({
          text: " is connected to this interval",
        });
      }

      if (!interval.path || this.override) {
        const expectedName = journal.getIntervalFileName(interval) + ".md";
        if (expectedName !== this.file.name) {
          const renameEl = new Setting(contentEl).setName("Rename").addToggle((toggle) => {
            toggle.setValue(this.rename).onChange((value) => {
              this.rename = value;
            });
          });
          renameEl.descEl.createSpan({
            text: "Note name ",
          });
          renameEl.descEl.createEl("b", {
            cls: "u-pop",
            text: this.file.name,
          });
          renameEl.descEl.createSpan({
            text: " differs from journal note name config: ",
          });
          renameEl.descEl.createEl("b", {
            cls: "u-pop",
            text: expectedName,
          });
        }

        const expectedFolder = journal.getIntervalFolderPath(interval) || "/";
        if (expectedFolder !== this.file.parent?.path) {
          const moveEl = new Setting(contentEl).setName("Move").addToggle((toggle) => {
            toggle.setValue(this.move).onChange((value) => {
              this.move = value;
            });
          });

          moveEl.descEl.createSpan({
            text: "Note folder ",
          });
          moveEl.descEl.createEl("b", {
            cls: "u-pop",
            text: this.file.parent?.path ?? "/",
          });
          moveEl.descEl.createSpan({
            text: " differs from journal folder path config: ",
          });
          moveEl.descEl.createEl("b", {
            cls: "u-pop",
            text: expectedFolder,
          });
        }

        new Setting(contentEl).addButton((button) => {
          button
            .setButtonText("Connect")
            .setCta()
            .onClick(async () => {
              await journal.connectNote(this.file, interval, {
                override: this.override,
                rename: this.rename,
                move: this.move,
              });
              this.close();
            });
        });
      }
    }
  }

  renderConnectedNote() {
    const { contentEl } = this;
    const journalData = this.journalFrontMatter;
    if (!journalData) return;
    const journal = this.manager.get(journalData.id);
    if (!journal) return;

    const title = new Setting(contentEl).setName("Note is already connected");
    title.descEl.createSpan({
      text: `Journal: `,
    });
    title.descEl.createEl("b", {
      cls: "u-pop",
      text: journal?.name,
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(async () => {
          this.close();
        });
      })
      .addButton((button) => {
        button
          .setButtonText("Disconnect")
          .setCta()
          .onClick(async () => {
            await journal.disconnectNote(this.file.path);
            this.journalFrontMatter = null;
            this.display();
          });
      });
  }
}
