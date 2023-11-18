import EventEmitter from "eventemitter3";
import { Disposable } from "../contracts/disposable.types";
import { CalndarSectionBase } from "../contracts/config.types";
import { Setting } from "obsidian";

export class SettingsBaseCalendarSection<T extends CalndarSectionBase> extends EventEmitter implements Disposable {
  constructor(
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
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
