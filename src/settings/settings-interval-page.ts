import { IntervalConfig } from "../contracts/config.types";
import { App, ButtonComponent, Setting } from "obsidian";
import { FolderSuggestion } from "./ui/folder-suggestion";
import { SettingsWidget } from "./settings-widget";
import { IconSuggestion } from "./ui/icon-suggestion";
import { CalendarHelper } from "../utils/calendar";
import { VariableReferenceModal } from "./ui/variable-reference";
import { IntervalCodeBlocksModal } from "./ui/interval-code-blocks";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_NAME_TEMPLATE_INTERVAL,
  DEFAULT_NAV_DATES_TEMPLATE_INTERVAL,
  DEFAULT_RIBBON_ICONS_INTERVAL,
} from "../config/config-defaults";
import { TemplateSuggestion } from "./ui/template-suggestion";
import { formatOrdinals } from "../utils/plural";

export class SettingsIntervalPage extends SettingsWidget {
  constructor(
    app: App,
    private containerEl: HTMLElement,
    private config: IntervalConfig,
    private calendar: CalendarHelper,
  ) {
    super(app);
  }

  get headingText(): string {
    return `Configuring ${this.config.name}`;
  }

  get dateFormat(): string {
    return this.config.dateFormat || DEFAULT_DATE_FORMAT;
  }

  get ribbonIcon(): string {
    return this.config.ribbon.icon || DEFAULT_RIBBON_ICONS_INTERVAL;
  }

  display(): void {
    const { containerEl } = this;

    const heading = new Setting(containerEl)
      .setName(this.headingText)
      .setDesc(
        `Duration: ${this.config.duration} ${this.config.granularity}, ${formatOrdinals(
          this.config.start_index,
        )} starts on ${this.config.start_date}, index ${
          this.config.numeration_type === "increment" ? "increases constantly" : "resets every year"
        }`,
      )
      .setHeading()
      .addButton((button) => {
        button.setButtonText("Back to list").onClick(() => {
          this.navigate({ type: "home" });
        });
      });

    const badge = heading.nameEl.createEl("span");
    badge.innerText = `ID: ${this.config.id}`;
    badge.classList.add("flair");

    new Setting(containerEl).setName("Journal Name").addText((text) => {
      text.setValue(this.config.name).onChange(() => {
        this.config.name = text.getValue();
        heading.setName(this.headingText);
        this.save();
      });
    });

    new Setting(containerEl)
      .setName("Open on Startup")
      .setDesc("Open a note whenever you open this vault?")
      .addToggle((toggle) => {
        toggle.setValue(this.config.openOnStartup).onChange(() => {
          this.config.openOnStartup = toggle.getValue();
          this.save(true);
        });
      });

    new Setting(containerEl)
      .setName("Open Note")
      .setDesc("Select how to open a note when navigating this journal")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            active: "Replacing active note",
            tab: "In new tab",
            split: "Adjusten to active note",
            window: "In popout window",
          })
          .setValue(this.config.openMode ?? "active")
          .onChange((value) => {
            this.config.openMode = value as IntervalConfig["openMode"];
            this.save();
          });
      });

    const nameTemplate = new Setting(containerEl).setName("Note name template").addText((text) => {
      text
        .setPlaceholder(DEFAULT_NAME_TEMPLATE_INTERVAL)
        .setValue(this.config.nameTemplate)
        .onChange((value) => {
          this.config.nameTemplate = value;
          this.save();
        });
    });
    nameTemplate.descEl.createEl("span", {
      text: "Template used to generate new note name.",
    });
    nameTemplate.descEl.createEl("br");
    this.createVariableReferenceHint(nameTemplate.descEl);

    const dateFormat = new Setting(containerEl).setName("Default date format").addMomentFormat((format) => {
      format
        .setPlaceholder(DEFAULT_DATE_FORMAT)
        .setValue(this.config.dateFormat)
        .onChange((value) => {
          this.config.dateFormat = value;
          dateFormatHint.innerText = this.calendar.today().format(this.dateFormat);
          this.save();
        });
    });
    dateFormat.descEl.createEl("span", {
      text: "Used to format dates if not defined in variable.",
    });
    dateFormat.descEl.createEl("br");
    dateFormat.descEl.createEl("a", {
      text: "Syntax reference.",
      href: "https://momentjs.com/docs/#/displaying/format/",
    });
    dateFormat.descEl.createEl("br");
    dateFormat.descEl.createEl("span", {
      text: "Your current syntax looks like this: ",
    });
    const dateFormatHint = dateFormat.descEl.createEl("b", {
      cls: "u-pop",
    });
    dateFormatHint.innerText = this.calendar.today().format(this.dateFormat);

    const folder = new Setting(containerEl).setName("Folder").addText((text) => {
      new FolderSuggestion(this.app, text.inputEl);
      text.setValue(this.config.folder).onChange((value) => {
        this.config.folder = value;
        this.save();
      });
    });
    folder.descEl.createEl("span", {
      text: "New notes will be created in this folder.",
    });
    folder.descEl.createEl("br");
    this.createVariableReferenceHint(folder.descEl);

    const template = new Setting(containerEl).setName("Template").addText((text) => {
      new TemplateSuggestion(this.app, text.inputEl);
      text.setValue(this.config.template).onChange((value) => {
        this.config.template = value;
        this.save();
      });
    });
    template.descEl.createEl("span", {
      text: "Path to note that will be used as template when creating new notes. ",
    });
    template.descEl.createEl("br");
    this.createVariableReferenceHint(template.descEl);
    template.descEl.createEl("br");
    this.createCodeBlockReferenceHint(template.descEl);

    new Setting(containerEl)
      .setName("Show in ribbon?")
      .setDesc("Changing ribbon settings requires Obsidian restart to take effect.")
      .addToggle((toggle) => {
        toggle.setValue(this.config.ribbon.show).onChange((value) => {
          this.config.ribbon.show = value;
          this.save(true);
        });
      });

    if (this.config.ribbon.show) {
      let iconPreviewButton: ButtonComponent | null = null;
      new Setting(containerEl)
        .setName("Ribbon icon")
        .setDesc("Select icon to be show in ribbon.")
        .addButton((button) => {
          iconPreviewButton = button;
          button.setIcon(this.ribbonIcon).setDisabled(true);
        })
        .addText((text) => {
          new IconSuggestion(this.app, text.inputEl);
          text.setValue(this.config.ribbon.icon).onChange((value) => {
            this.config.ribbon.icon = value;
            iconPreviewButton?.setIcon(this.ribbonIcon);
            this.save();
          });
        });
      new Setting(containerEl).setName("Ribbon tooltip").addText((text) => {
        text
          .setValue(this.config.ribbon.tooltip)
          .setPlaceholder(`Open current ${this.config.name} note`)
          .onChange((value) => {
            this.config.ribbon.tooltip = value;
            this.save();
          });
      });
    }

    new Setting(containerEl)
      .setName("Create note on startup")
      .setDesc("Automatically create notes whenever you open this vault.")
      .addToggle((toggle) => {
        toggle.setValue(this.config.createOnStartup ?? false).onChange((value) => {
          this.config.createOnStartup = value;
          this.save();
        });
      });

    const navNameTemplate = new Setting(containerEl).setName("Navigation name template").addText((text) => {
      text
        .setPlaceholder(this.config.nameTemplate || DEFAULT_NAME_TEMPLATE_INTERVAL)
        .setValue(this.config.navNameTemplate)
        .onChange((value) => {
          this.config.navNameTemplate = value;
          this.save();
        });
    });
    navNameTemplate.descEl.createEl("span", {
      text: "Template used to render the name in navigation code blocks.",
    });
    navNameTemplate.descEl.createEl("br");
    this.createVariableReferenceHint(navNameTemplate.descEl);

    const navDatesTemplate = new Setting(containerEl).setName("Navigation dates template").addText((text) => {
      text
        .setPlaceholder(this.config.navDatesTemplate || DEFAULT_NAV_DATES_TEMPLATE_INTERVAL)
        .setValue(this.config.navDatesTemplate)
        .onChange((value) => {
          this.config.navDatesTemplate = value;
          this.save();
        });
    });
    navDatesTemplate.descEl.createEl("span", {
      text: "Template used to render the dates in navigation code blocks.",
    });
    navDatesTemplate.descEl.createEl("br");
    this.createVariableReferenceHint(navDatesTemplate.descEl);
    navDatesTemplate.descEl.createEl("span", {
      text: " You can also use the pipe symbol for line breaks.",
    });
  }

  createVariableReferenceHint(el: HTMLElement): void {
    const link = el.createEl("span", {
      cls: "var-ref journal-link",
      text: "Supported variables.",
    });
    link.on("click", ".var-ref", () => {
      new VariableReferenceModal(this.app, "interval", "year", this.config.dateFormat).open();
    });
  }

  createCodeBlockReferenceHint(el: HTMLElement): void {
    const link = el.createEl("span", {
      cls: "code-ref journal-link",
      text: "Supported code blocks",
    });

    link.on("click", ".code-ref", () => {
      new IntervalCodeBlocksModal(this.app, this.config, this.calendar).open();
    });
  }
}
