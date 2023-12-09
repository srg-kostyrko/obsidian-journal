import { App, Modal } from "obsidian";
import { CalendarGranularity } from "../../contracts/config.types";

export class VariableReferenceModal extends Modal {
  constructor(
    app: App,
    private type: "calendar" | "interval",
    private granularity: CalendarGranularity,
    private dateFormat: string,
  ) {
    super(app);
  }

  onOpen() {
    this.titleEl.innerText = "Variable reference";
    this.contentEl.on("click", ".journal-variable", (e) => {
      navigator.clipboard.writeText((e.target as HTMLElement).innerText);
    });
    this.display();
  }

  display() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("p", {
      cls: "journal-hint",
      text: "Clicking on variable will copy it to clipboard.",
    });

    const grid = contentEl.createEl("div", {
      cls: "journal-variables-grid",
    });

    this.renderVariable(grid.createDiv(), "journal_name");
    grid.createDiv({
      text: "Name of corresponding journal",
    });
    this.renderVariable(grid.createDiv(), "note_name");
    grid.createDiv({
      text: "Name of current note",
    });
    if (this.granularity === "day") {
      this.renderVariable(grid.createDiv(), "date");
      const div = grid.createDiv({
        text: `Note date formatted using default format settings (${this.dateFormat}).`,
      });
      div.createEl("br");
      div.createSpan({
        text: "You can also use {{date:format}} to override format once.",
      });
    } else {
      this.renderVariable(grid.createDiv(), "start_date");
      const div1 = grid.createDiv({
        text:
          this.type === "interval"
            ? `Starting date of note interval formatted using default format settings (${this.dateFormat}). `
            : `First day of ${this.granularity} formatted using default format settings (${this.dateFormat}).`,
      });
      div1.createEl("br");
      div1.createSpan({
        text: "You can also use {{start_date:format}} to override format once.",
      });
      this.renderVariable(grid.createDiv(), "end_date");
      const div2 = grid.createDiv({
        text:
          this.type === "interval"
            ? `End date of note interval formatted using default format settings (${this.dateFormat}).`
            : `Last day of ${this.granularity} formatted using default format settings (${this.dateFormat}).`,
      });
      div2.createEl("br");
      div2.createSpan({
        text: "You can also use {{end_date:format}} to override format once.",
      });
    }

    if (this.type === "interval") {
      this.renderVariable(grid.createDiv(), "index");
      grid.createDiv({
        text: "Index of current interval",
      });
    }
  }

  renderVariable(parent: HTMLElement, name: string) {
    parent.createEl("span", {
      cls: "journal-variable",
      text: `{{${name}}}`,
    });
  }
}
