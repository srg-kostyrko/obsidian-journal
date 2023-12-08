import { CalendarConfig, CalendarSection } from "../contracts/config.types";
import { App, ButtonComponent, Setting } from "obsidian";
import { FolderSuggestion } from "./ui/folder-suggestion";
import { IconSuggestion } from "./ui/icon-suggestion";
import { SettingsWidget } from "./settings-widget";
import { capitalize } from "../utils";

export class SettingsCalendarSectionPage extends SettingsWidget {
  private folderSuggestions: FolderSuggestion[] = [];
  constructor(
    app: App,
    protected journal: CalendarConfig,
    protected containerEl: HTMLElement,
    protected config: CalendarSection,
    protected name: string,
  ) {
    super(app);
  }

  display() {
    const { containerEl } = this;

    new Setting(containerEl)
      .setName(`${capitalize(this.name)} Notes`)
      .setHeading()
      .addButton((button) => {
        button
          .setIcon("arrow-left")
          .setTooltip("Back to journal")
          .onClick(() => {
            this.navigate({ type: "journal", id: this.journal.id });
          });
      });

    if (!this.config.enabled) return;

    new Setting(containerEl).setName("Open Note").addDropdown((dropdown) => {
      dropdown
        .addOptions({
          active: "Replacing active note",
          tab: "In new tab",
          split: "Adjusten to active note",
          window: "In popout window",
        })
        .setValue(this.config.openMode ?? "active")
        .onChange((value) => {
          this.config.openMode = value as CalendarSection["openMode"];
          this.save();
        });
    });

    new Setting(containerEl).setName("Note name").addText((text) => {
      text.setValue(this.config.nameTemplate).onChange((value) => {
        this.config.nameTemplate = value;
        this.save();
      });
    });

    new Setting(containerEl).setName("Date format").addMomentFormat((format) => {
      format.setValue(this.config.dateFormat).onChange((value) => {
        this.config.dateFormat = value;
        this.save();
      });
    });

    new Setting(containerEl).setName("Folder").addText((text) => {
      this.folderSuggestions.push(new FolderSuggestion(this.app, text.inputEl, this.journal.rootFolder));
      text.setValue(this.config.folder).onChange((value) => {
        this.config.folder = value;
        this.save();
      });
    });

    new Setting(containerEl).setName("Template").addText((text) => {
      text.setValue(this.config.template).onChange((value) => {
        this.config.template = value;
        this.save();
      });
    });

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
      let iconPreivewButton: ButtonComponent | null = null;
      new Setting(containerEl)
        .setName("Ribbon icon")
        .addButton((button) => {
          iconPreivewButton = button;
          button.setIcon(this.config.ribbon.icon).setDisabled(true);
        })
        .addText((text) => {
          new IconSuggestion(this.app, text.inputEl);
          text.setValue(this.config.ribbon.icon).onChange((value) => {
            this.config.ribbon.icon = value;
            iconPreivewButton?.setIcon(value);
            this.save();
          });
        });
      new Setting(containerEl).setName("Ribbon tooltip").addText((text) => {
        text
          .setValue(this.config.ribbon.tooltip)
          .setPlaceholder(`Open ${this.name} note`)
          .onChange((value) => {
            this.config.ribbon.tooltip = value;
            this.save();
          });
      });
    }

    new Setting(containerEl).setName("Create note on startup").addToggle((toggle) => {
      toggle.setValue(this.config.createOnStartup ?? false).onChange((value) => {
        this.config.createOnStartup = value;
        this.save();
      });
    });
  }

  updateFolderSuggestions(root: string): void {
    for (const suggestion of this.folderSuggestions) {
      suggestion.root = root;
    }
  }
}
