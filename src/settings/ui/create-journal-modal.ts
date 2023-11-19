import { App, Modal, Setting } from "obsidian";
import { JournalManager } from "../../journal-manager";
import EventEmitter from "eventemitter3";

export class CreateJournalModal extends Modal {
  private name = "";

  constructor(
    app: App,
    private manager: JournalManager,
    private parent: EventEmitter,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;

    new Setting(contentEl).setName("Create Journal").setHeading();

    new Setting(contentEl).setName("Jornal Name").addText((text) => {
      text.setPlaceholder("ex. Work").onChange((value) => {
        this.name = value;
      });
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Close").onClick(() => this.close());
      })
      .addButton((button) => {
        button
          .setButtonText("Create")
          .setCta()
          .onClick(async () => {
            console.log(this.name);
            this.close();
            const id = await this.manager.createCalendarJournal(this.name);
            this.parent.emit("navigate", {
              type: "journal",
              id,
            });
          });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
