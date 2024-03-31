import { App, Modal, Setting, TFile, TFolder } from "obsidian";
import { JournalManager } from "../journal-manager";
import { CalendarConfig, CalendarGranularity } from "../contracts/config.types";
import { FolderSuggestion } from "../settings/ui/folder-suggestion";
import { SECTIONS_MAP } from "../constants";
import { DEFAULT_DATE_FORMATS_CALENDAR } from "../config/config-defaults";
import { formatToRegexp } from "../utils/moment";
import { CalendarJournal } from "../calendar-journal/calendar-journal";

interface NoteFilter {
  type: "name" | "tag" | "property";
  name_condition: "contains" | "not_contains" | "starts_with" | "ends_with";
  tag_condition: "contains" | "starts_with" | "ends_with";
  property_name: string;
  property_condition:
    | "exists"
    | "not_exists"
    | "is"
    | "is_not"
    | "contains"
    | "not_contains"
    | "starts_with"
    | "ends_with";
  value: string;
}

export class AddNotesJournalModal extends Modal {
  private journal: CalendarJournal;
  private mode: "setup" | "processing" = "setup";

  private folder = "";
  private granularity: CalendarGranularity = "day";
  private date_place: "title" | "property" = "title";
  private date_propery_name = "";
  private date_format = DEFAULT_DATE_FORMATS_CALENDAR.day;
  private filters_combination: "no" | "or" | "and" = "no";
  private filters: NoteFilter[] = [];

  private errorsEl: HTMLElement;
  private consoleEl: HTMLElement;
  private console_ident = 0;
  private dateRegexp: RegExp;

  constructor(
    app: App,
    private manager: JournalManager,
    private config: CalendarConfig,
  ) {
    super(app);
    this.journal = this.manager.get(this.config.name) as CalendarJournal;
  }

  onOpen(): void {
    this.display();
    this.titleEl.setText(`Add notes to ${this.config.name} Journal`);
    this.modalEl.classList.add("journal-add-notes-modal");
  }

  display(): void {
    switch (this.mode) {
      case "setup":
        this.displaySetup();
        break;
      case "processing":
        this.displayProcessing();
        break;
    }
  }

  private displaySetup(): void {
    const { contentEl } = this;
    contentEl.empty();

    new Setting(contentEl)
      .setName("Folder")
      .setDesc("Select folder with existing notes that you want to process")
      .addText((text) => {
        new FolderSuggestion(this.app, text.inputEl);
        text.setValue(this.folder).onChange((value) => {
          this.folder = value;
        });
      });

    const sections: CalendarGranularity[] = [];
    if (this.config.day.enabled) sections.push("day");
    if (this.config.week.enabled) sections.push("week");
    if (this.config.month.enabled) sections.push("month");
    if (this.config.quarter.enabled) sections.push("quarter");
    if (this.config.year.enabled) sections.push("year");

    if (!sections.length) {
      new Setting(contentEl)
        .setName("No sections enabled")
        .setDesc("Enable at least one journal section to start process");
      return;
    }
    if (!sections.includes(this.granularity)) {
      this.granularity = sections[0];
      this.date_format = DEFAULT_DATE_FORMATS_CALENDAR[this.granularity];
    }

    new Setting(contentEl).setName("Search for").addDropdown((dropdown) => {
      for (const section of sections) {
        dropdown.addOption(section, `${SECTIONS_MAP[section]} notes`);
      }
      dropdown.setValue(this.granularity).onChange((value) => {
        this.granularity = value as CalendarGranularity;
        this.date_format = DEFAULT_DATE_FORMATS_CALENDAR[this.granularity];
        this.display();
      });
    });

    new Setting(contentEl).setName("Take date from").addDropdown((dropdown) => {
      dropdown
        .addOption("title", "Note title")
        .addOption("property", "Property")
        .setValue(this.date_place)
        .onChange((value) => {
          this.date_place = value as "title" | "property";
          this.display();
        });
    });
    if (this.date_place === "property") {
      new Setting(contentEl).setName("Property containing date").addText((text) => {
        text.setValue(this.date_propery_name).onChange((value) => {
          this.date_propery_name = value;
        });
      });
    }

    const dateFormat = new Setting(contentEl).setName(`Date format`).addMomentFormat((text) => {
      text.setValue(this.date_format).onChange((value) => {
        this.date_format = value;
        if (this.date_format) {
          dateFormatHint.innerText = this.manager.calendar.today().format(this.date_format);
        } else {
          dateFormatHint.innerText = "";
        }
      });
    });

    dateFormat.descEl.createEl("a", {
      text: "Syntax reference.",
      attr: {
        target: "_blank",
      },
      href: "https://momentjs.com/docs/#/displaying/format/",
    });
    dateFormat.descEl.createDiv({
      text: "If your dates have time component in them - please omit it in format.",
    });
    dateFormat.descEl.createEl("span", {
      text: "Your current syntax looks like this: ",
    });
    const dateFormatHint = dateFormat.descEl.createEl("b", {
      cls: "u-pop",
    });
    if (this.date_format) {
      dateFormatHint.innerText = this.manager.calendar.today().format(this.date_format);
    }
    if (this.date_place === "property") {
      dateFormat.descEl.createDiv({
        text: "Please pay attention that dates might differ from how they are stored. Check format in Source display mode.",
      });
    }

    new Setting(contentEl).setName("Process").addDropdown((dropdown) => {
      dropdown
        .addOption("no", "All notes")
        .addOption("or", "Notes that match any filter")
        .addOption("and", "Notes that match all filters")
        .setValue(this.filters_combination)
        .onChange((value) => {
          this.filters_combination = value as "no" | "or" | "and";
          this.display();
        });
    });

    if (this.filters_combination !== "no") {
      const filtersEl = contentEl.createDiv();
      this.renderFilters(filtersEl);
    }

    this.errorsEl = contentEl.createDiv({
      cls: "journal-warning",
    });

    new Setting(contentEl).addButton((button) => {
      button
        .setButtonText("Start")
        .setCta()
        .onClick(async () => {
          this.startProcessing();
        });
    });
  }

  private renderFilters(contentEl: HTMLElement): void {
    contentEl.empty();
    new Setting(contentEl).setName("Filters").addButton((button) => {
      button.setIcon("plus").onClick(() => {
        this.filters.push({
          type: "name",
          name_condition: "contains",
          tag_condition: "contains",
          property_name: "",
          property_condition: "exists",
          value: "",
        });
        this.renderFilters(contentEl);
      });
    });
    for (const filter of this.filters) {
      const filterEl = contentEl.createDiv();
      this.renderSectionFilterConfig(filterEl, filter, () => {
        this.filters.remove(filter);
        this.renderFilters(contentEl);
      });
    }
  }

  private renderSectionFilterConfig(contentEl: HTMLElement, filter: NoteFilter, removeFilter: () => void): void {
    contentEl.empty();

    const setting = new Setting(contentEl);

    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("name", "Node title")
        .addOption("tag", "Any tag in note")
        .addOption("property", "Property")
        .setValue(filter.type)
        .onChange((value) => {
          filter.type = value as NoteFilter["type"];
          this.renderSectionFilterConfig(contentEl, filter, removeFilter);
        });
    });
    if (filter.type === "name") {
      setting.addDropdown((dropdown) => {
        dropdown
          .addOption("contains", "contains")
          .addOption("not_contains", "doesn't contain")
          .addOption("starts_with", "starts with")
          .addOption("ends_with", "ends with")
          .setValue(filter.name_condition)
          .onChange((value) => {
            filter.name_condition = value as NoteFilter["name_condition"];
          });
      });
      setting.addText((text) => {
        text.setValue(filter.value).onChange((value) => {
          filter.value = value;
        });
      });
    } else if (filter.type === "tag") {
      setting.addDropdown((dropdown) => {
        dropdown
          .addOption("contains", "contains")
          .addOption("starts_with", "starts with")
          .addOption("ends_with", "ends with")
          .setValue(filter.tag_condition)
          .onChange((value) => {
            filter.tag_condition = value as NoteFilter["tag_condition"];
          });
      });
      setting.addText((text) => {
        text.setValue(filter.value).onChange((value) => {
          filter.value = value;
        });
      });
    } else if (filter.type === "property") {
      setting.addText((text) => {
        text
          .setValue(filter.property_name)
          .setPlaceholder("ex. Important")
          .onChange((value) => {
            filter.property_name = value;
          });
      });

      setting.addDropdown((dropdown) => {
        dropdown
          .addOption("exists", "exists")
          .addOption("not_exists", "doesn't exist")
          .addOption("is", "is")
          .addOption("is_not", "is not")
          .addOption("contains", "contains")
          .addOption("not_contains", "doesn't contain")
          .addOption("starts_with", "starts with")
          .addOption("ends_with", "ends with")
          .setValue(filter.property_condition)
          .onChange((value) => {
            filter.property_condition = value as NoteFilter["property_condition"];
            this.renderSectionFilterConfig(contentEl, filter, removeFilter);
          });
      });
      if (filter.property_condition !== "exists" && filter.property_condition !== "not_exists") {
        setting.addText((text) => {
          text.setValue(filter.value).onChange((value) => {
            filter.value = value;
          });
        });
      }
    }

    setting.addExtraButton((button) => {
      button.setIcon("trash").onClick(() => {
        removeFilter();
      });
    });
  }

  private displayProcessing(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.consoleEl = contentEl.createEl("pre");
  }

  private async startProcessing(): Promise<void> {
    this.errorsEl.empty();
    const folder = this.app.vault.getFolderByPath(this.folder ? this.folder : "/");
    if (!folder) {
      this.errorsEl.setText(`Folder ${this.folder} not found`);
      return;
    }
    this.dateRegexp = formatToRegexp(this.date_format);
    this.mode = "processing";
    this.displayProcessing();
    await this.processFolder(folder);
    this.writeToConsole("Finished");

    new Setting(this.contentEl)
      .addButton((button) => {
        button.setButtonText("Close").onClick(() => {
          this.close();
        });
      })
      .addButton((button) => {
        button
          .setButtonText("Add other notes")
          .setCta()
          .onClick(() => {
            this.mode = "setup";
            this.display();
          });
      });
  }

  private async processFolder(folder: TFolder): Promise<void> {
    this.writeToConsole(`Processing ${folder.name ? folder.name : "vault"}`);
    this.console_ident++;
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        await this.processFolder(child);
      } else if (child instanceof TFile) {
        await this.processNote(child);
      }
    }
    this.console_ident--;
  }

  private async processNote(note: TFile): Promise<void> {
    this.writeToConsole(`Processing ${note.basename}`);
    const journalData = await this.manager.getJournalData(note.path);
    this.console_ident++;
    try {
      if (journalData) {
        if (journalData.id === this.journal.id) return this.writeToConsole(`Already in journal - skipped`);
        const otherJournal = this.manager.get(journalData.id);
        if (otherJournal) return this.writeToConsole(`Already in another journal ${otherJournal.name} - skipped`);
      }
      if (!this.checkFilters(note)) return this.writeToConsole(`Does not match filters - skipped`);
      const dateString =
        this.date_place === "title"
          ? note.basename
          : this.app.metadataCache.getFileCache(note)?.frontmatter?.[this.date_propery_name];
      const match = dateString?.match(this.dateRegexp);
      if (!match) return this.writeToConsole(`Date not found - skipped`);
      const date = this.manager.calendar.date(match[0], this.date_format);
      if (!date.isValid()) return this.writeToConsole(`Invalid date - skipped`);
      const section = this.journal[this.granularity];
      const rangeStart = section.getRangeStart(date.format("YYYY-MM-DD"));
      const rangeEnd = section.getRangeEnd(date.format("YYYY-MM-DD"));
      const indexed = this.journal.index.get(rangeStart, this.granularity);
      if (indexed) {
        if (indexed.path === note.path)
          return this.writeToConsole(`Note ${note.basename} is already connected to journal - skipped`);
        else return this.writeToConsole(`Other note ${indexed.path} is connected to this date - skipped`);
      }
      await this.journal[this.granularity].connectNote(note, rangeStart, rangeEnd, {});

      this.writeToConsole(`Added ${note.basename} to journal for ${date.format(section.dateFormat)}`);
    } finally {
      this.console_ident--;
    }
  }

  private checkFilters(note: TFile): boolean {
    if (this.filters_combination === "no") return true;
    if (this.filters_combination === "and") return this.filters.every((filter) => this.checkFilter(note, filter));
    return this.filters.some((filter) => this.checkFilter(note, filter));
  }

  private checkFilter(note: TFile, filter: NoteFilter): boolean {
    switch (filter.type) {
      case "name":
        return this.checkNameFilter(note, filter);
      case "tag":
        return this.checkTagFilter(note, filter);
      case "property":
        return this.checkPropertyFilter(note, filter);
    }
    return true;
  }

  private checkNameFilter(note: TFile, filter: NoteFilter): boolean {
    switch (filter.name_condition) {
      case "contains":
        return note.basename.contains(filter.value);
      case "not_contains":
        return !note.basename.contains(filter.value);
      case "starts_with":
        return note.basename.startsWith(filter.value);
      case "ends_with":
        return note.basename.endsWith(filter.value);
    }
    return true;
  }

  private checkTagFilter(note: TFile, filter: NoteFilter): boolean {
    const metadata = this.app.metadataCache.getFileCache(note);
    if (!metadata) return false;
    if (!metadata.tags) return false;
    switch (filter.tag_condition) {
      case "contains":
        return metadata.tags.some((tag) => tag.tag.contains(filter.value));
      case "starts_with":
        return metadata.tags.some((tag) => tag.tag.startsWith(filter.value));
      case "ends_with":
        return metadata.tags.some((tag) => tag.tag.endsWith(filter.value));
    }
    return true;
  }

  private checkPropertyFilter(note: TFile, filter: NoteFilter): boolean {
    const metadata = this.app.metadataCache.getFileCache(note);
    if (!metadata) return false;
    const propertyValue = metadata.frontmatter?.[filter.property_name];
    const type = typeof propertyValue;
    switch (filter.property_condition) {
      case "exists":
        return !!metadata.frontmatter && filter.property_name in metadata.frontmatter;
      case "not_exists":
        return !!metadata.frontmatter && !(filter.property_name in metadata.frontmatter);
      case "is":
        return propertyValue == filter.value;
      case "is_not":
        return propertyValue != filter.value;
      case "contains":
        return type === "string" && propertyValue?.contains(filter.value);
      case "not_contains":
        return type !== "string" || (type === "string" && !propertyValue?.contains(filter.value));
      case "starts_with":
        return type === "string" && propertyValue?.startsWith(filter.value);
      case "ends_with":
        return type === "string" && propertyValue?.endsWith(filter.value);
    }
    return true;
  }

  private writeToConsole(text: string): void {
    const identText = " ".repeat(this.console_ident * 2);
    this.consoleEl?.createDiv({
      text: identText + text,
    });
  }
}
