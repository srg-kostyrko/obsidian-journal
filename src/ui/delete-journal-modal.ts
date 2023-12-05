import { App, Modal, Setting } from "obsidian";
import { JournalManager } from "../journal-manager";
import { JournalConfig } from "../contracts/config.types";
import { NotesProcessing } from "../contracts/journal.types";

export class DeleteJournalModal extends Modal {
  private notesProcessing: NotesProcessing = "keep";

  constructor(
    app: App,
    private manager: JournalManager,
    private config: JournalConfig,
  ) {
    super(app);
  }

  onOpen(): void {
    this.display();
    this.titleEl.setText(`Delete ${this.config.name} Journal`);
  }

  display(): void {
    const { contentEl } = this;
    contentEl.empty();

    new Setting(contentEl).setName("Journal Notes").addDropdown((dropdown) => {
      dropdown
        .addOptions({
          keep: "Keep",
          clear: "Clear",
          delete: "Delete",
        })
        .setValue(this.notesProcessing)
        .onChange((value) => {
          this.notesProcessing = value as NotesProcessing;
          this.display();
        });
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(async () => {
          this.close();
        });
      })
      .addButton((button) => {
        button
          .setButtonText("Delete")
          .setWarning()
          .onClick(async () => {
            await this.manager.deleteJournal(this.config.id, this.notesProcessing);
            this.close();
            this.app.workspace.trigger("journal:settings-navigate", { type: "home" });
          });
      });
  }
}
