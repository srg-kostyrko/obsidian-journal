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

  private errors: string[] = [];

  constructor(
    app: App,
    private manager: JournalManager,
  ) {
    super(app);
  }

  onOpen() {
    this.titleEl.innerText = "Add Journal";
    this.display();
  }

  validate() {
    this.errors = [];
    if (!this.name) this.errors.push("Name is required");
    if (!this.id) this.errors.push("ID is required");
    if (this.type === "interval") {
      if (!this.duration) this.errors.push("Duration is required");
      if (!this.granularity) this.errors.push("Granularity is required");
      if (!this.start_date) this.errors.push("Start date is required");
      if (!this.start_index) this.errors.push("Start index is required");
    }
  }

  display() {
    const { contentEl } = this;
    contentEl.empty();

    new Setting(contentEl)
      .setName("Type")
      .setDesc(
        this.type === "interval"
          ? "Interval based journal can be used for notes that are bound to time intervals not aligned with the calendar (like financial quarters or 2 week sprints)"
          : "Calendar based journal can be used for daily, weekly, monthly, quarterly, and yearly notes",
      )
      .addDropdown((dropdown) => {
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

    new Setting(contentEl).setName("Name").addText((text) => {
      text.setPlaceholder("ex. Work").onChange((value) => {
        this.name = value;
      });
      text.inputEl.required = true;
    });

    new Setting(contentEl)
      .setName("ID")
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
        .setDesc("Define duration of an interval")
        .addText((text) => {
          text.inputEl.classList.add("journal-small-input");
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

      new Setting(contentEl).setName("Start date").addButton((button) => {
        button.setButtonText(this.start_date || "Pick date").onClick(() => {
          new DatePickerModal(
            this.app,
            this.manager,
            (date: string) => {
              this.start_date = date;
              this.display();
            },
            this.start_date,
          ).open();
        });
      });

      new Setting(contentEl).setName("Start index").addText((text) => {
        text.inputEl.classList.add("journal-small-input");
        text.setValue(this.start_index.toString()).onChange((value) => {
          this.start_index = parseInt(value, 10);
        });
      });

      new Setting(contentEl)
        .setName("Index change")
        .setDesc("Define how index of ongoing interval will change")
        .addDropdown((dropdown) => {
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

    if (this.errors.length > 0) {
      const ul = contentEl.createEl("ul", { cls: "journal-warning" });
      for (const error of this.errors) {
        ul.createEl("li", { text: error });
      }
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
            this.validate();
            if (this.errors.length > 0) {
              this.display();
              return;
            }
            this.close();
            if (this.type === "interval") {
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
