import { App, Modal, Setting } from "obsidian";
import { JournalManager } from "../../journal-manager";

export class CreateJournalModal extends Modal {
  private name = "";
  private id = "";

  constructor(
    app: App,
    private manager: JournalManager,
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
      text.inputEl.required = true;
    });

    new Setting(contentEl)
      .setName("Jornal ID")
      .setDesc("This will be used to connect nodes to journal in frontmatter")
      .addText((text) => {
        text.setPlaceholder("ex. work").onChange((value) => {
          this.id = value;
        });
        text.inputEl.required = true;
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
            if (!this.name || !this.id) return;
            this.close();
            const id = await this.manager.createCalendarJournal(this.id, this.name);
            this.app.workspace.trigger("journal:navigate", {
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
