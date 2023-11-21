import EventEmitter from "eventemitter3";
import { Disposable } from "../contracts/disposable.types";
import { CalendarConfig, CalndarSectionBase } from "../contracts/config.types";
import { App, ButtonComponent, Setting } from "obsidian";
import { FolderSuggestion } from "./ui/folder-suggestion";
import { IconSuggestion } from "./ui/icon-suggestion";

export class SettingsBaseCalendarSection<T extends CalndarSectionBase> extends EventEmitter implements Disposable {
  private folderSuggestions: FolderSuggestion[] = [];
  constructor(
    protected app: App,
    protected journal: CalendarConfig,
    protected containerEl: HTMLElement,
    protected config: T,
    protected title: string,
  ) {
    super();
  }

  display() {
    const { containerEl } = this;

    new Setting(containerEl)
      .setName(`${this.title} Notes`)
      .setHeading()
      .addToggle((toggle) => {
        toggle.setValue(this.config.enabled).onChange((value) => {
          this.config.enabled = value;
          this.emit("save+redraw");
        });
      });

    if (!this.config.enabled) return;

    new Setting(containerEl).setName("Note title").addText((text) => {
      text.setValue(this.config.titleTemplate).onChange((value) => {
        this.config.titleTemplate = value;
        this.emit("save");
      });
    });

    new Setting(containerEl).setName("Date format").addMomentFormat((format) => {
      format.setValue(this.config.dateFormat).onChange((value) => {
        this.config.dateFormat = value;
        this.emit("save");
      });
    });

    new Setting(containerEl).setName("Folder").addText((text) => {
      this.folderSuggestions.push(new FolderSuggestion(this.app, text.inputEl, this.journal.rootFolder));
      text.setValue(this.config.folder).onChange((value) => {
        this.config.folder = value;
        this.emit("save");
      });
    });

    new Setting(containerEl).setName("Template").addText((text) => {
      text.setValue(this.config.template).onChange((value) => {
        this.config.template = value;
        this.emit("save");
      });
    });

    new Setting(containerEl)
      .setName("Show in ribbon?")
      .setDesc("Changing ribbon settings requires Obsidian restart to take effect.")
      .addToggle((toggle) => {
        toggle.setValue(this.config.ribbon.show).onChange((value) => {
          this.config.ribbon.show = value;
          this.emit("save+redraw");
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
            this.emit("save");
          });
        });
      new Setting(containerEl).setName("Ribbon tooltip").addText((text) => {
        text
          .setValue(this.config.ribbon.tooltip)
          .setPlaceholder(`Open ${this.title} note`)
          .onChange((value) => {
            this.config.ribbon.tooltip = value;
            this.emit("save");
          });
      });
    }
  }

  updateFolderSuggestions(root: string): void {
    for (const suggestion of this.folderSuggestions) {
      suggestion.root = root;
    }
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
