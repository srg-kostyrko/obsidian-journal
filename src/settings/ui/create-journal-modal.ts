import { App, Modal, Setting } from "obsidian";
import { JournalManager } from "../../journal-manager";
import { CalendarGranularity, IntervalConfig, JournalConfig } from "../../contracts/config.types";
import { DEFAULT_CONFIG_INTERVAL } from "../../config/config-defaults";
import { DatePickerModal } from "../../ui/date-picker-modal";

export class CreateJournalModal extends Modal {
  private name = "";
  private id = "";
  private type: JournalConfig["type"] = "calendar";
  private duration = 1;
  private granularity: CalendarGranularity = "week";
  private start_date = "";
  private start_index = 1;
  private numeration_type: IntervalConfig["numeration_type"] = "increment";

  constructor(
    app: App,
    private manager: JournalManager,
  ) {
    super(app);
  }

  onOpen() {
    this.display();
  }

  display() {
    const { contentEl } = this;
    contentEl.empty();

    new Setting(contentEl).setName("Add Journal").setHeading();

    new Setting(contentEl).setName("Jornal Type").addDropdown((dropdown) => {
      dropdown
        .addOptions({
          calendar: "Calendar based",
          interval: "Interval based",
        })
        .setValue(this.type)
        .onChange((value) => {
          this.type = value as JournalConfig["type"];
          this.display();
        });
    });

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

    if (this.type === "interval") {
      new Setting(contentEl)
        .setName("Interval")
        .addText((text) => {
          text.setValue(this.duration.toString()).onChange((value) => {
            this.duration = parseInt(value, 10);
          });
        })
        .addDropdown((dropdown) => {
          dropdown
            .addOptions({
              day: "Day",
              week: "Week",
              month: "Month",
            })
            .setValue(this.granularity)
            .onChange((value) => {
              this.granularity = value as CalendarGranularity;
            });
        });

      new Setting(contentEl).setName("Start Date").addButton((button) => {
        button.setButtonText(this.start_date || "Pick date").onClick(() => {
          new DatePickerModal(
            this.app,
            this.manager.calendar,
            (date: string) => {
              this.start_date = date;
              this.display();
            },
            this.start_date,
          ).open();
        });
      });

      new Setting(contentEl).setName("Start Index").addText((text) => {
        text.setValue(this.start_index.toString()).onChange((value) => {
          this.start_index = parseInt(value, 10);
        });
      });

      new Setting(contentEl).setName("Index change").addDropdown((dropdown) => {
        dropdown
          .addOptions({
            increment: "Increasing",
            year: "Yearly restart (ex. quarters)",
          })
          .setValue(this.numeration_type)
          .onChange((value) => {
            this.numeration_type = value as IntervalConfig["numeration_type"];
          });
      });
    }

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Close").onClick(() => this.close());
      })
      .addButton((button) => {
        button
          .setButtonText("Add")
          .setCta()
          .onClick(async () => {
            if (!this.name || !this.id) return;
            if (this.type === "interval") {
              if (!this.duration || !this.start_date || !this.start_index) return;
              this.close();
              const config: IntervalConfig = {
                ...DEFAULT_CONFIG_INTERVAL,
                id: this.id,
                name: this.name,
                duration: this.duration,
                granularity: this.granularity,
                start_date: this.start_date,
                start_index: this.start_index,
                numeration_type: this.numeration_type,
              };
              const id = await this.manager.createIntervalJournal(config);
              this.app.workspace.trigger("journal:settings-navigate", {
                type: "journal",
                id,
              });
              return;
            }
            this.close();
            const id = await this.manager.createCalendarJournal(this.id, this.name);
            this.app.workspace.trigger("journal:settings-navigate", {
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
