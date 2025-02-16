import { type App, Modal } from "obsidian";
import type { CalendarGranularity } from "../../contracts/config.types";

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
    this.renderVariable(grid.createDiv(), "title");
    grid.createDiv({
      text: "Name of current note (to support core template variable)",
    });
    if (this.granularity === "day") {
      this.renderVariable(grid.createDiv(), "date");
      const div = grid.createDiv({
        text: `Note date formatted using default format settings (${this.dateFormat}).`,
      });
      div.createEl("br");
      div.createSpan({
        text: "You can also use {{date:format}} to override format once, and use {{date+5d:format}} to add 5 days.",
      });
      div.createEl("br");
      div.createEl("a", {
        text: "Formatting reference.",
        attr: {
          target: "_blank",
        },
        href: "https://momentjs.com/docs/#/displaying/format/",
      });
      div.createEl("br");
      div.createEl("a", {
        text: "Date manipulation reference.",
        attr: {
          target: "_blank",
        },
        href: "https://momentjs.com/docs/#/manipulating/add/",
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
        text: "You can also use {{start_date:format}} to override format once, and use {{start_date+5d:format}} to add 5 days.",
      });
      div1.createEl("br");
      div1.createEl("a", {
        text: "Formatting reference.",
        attr: {
          target: "_blank",
        },
        href: "https://momentjs.com/docs/#/displaying/format/",
      });
      div1.createEl("br");
      div1.createEl("a", {
        text: "Date manipulation reference.",
        attr: {
          target: "_blank",
        },
        href: "https://momentjs.com/docs/#/manipulating/add/",
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
        text: "You can also use {{end_date:format}} to override format once, and use {{end_date+5d:format}} to add 5 days.",
      });
      div2.createEl("br");
      div2.createEl("a", {
        text: "Formatting reference.",
        attr: {
          target: "_blank",
        },
        href: "https://momentjs.com/docs/#/displaying/format/",
      });
      div2.createEl("br");
      div2.createEl("a", {
        text: "Date manipulation reference.",
        attr: {
          target: "_blank",
        },
        href: "https://momentjs.com/docs/#/manipulating/add/",
      });
    }

    if (this.type === "interval") {
      this.renderVariable(grid.createDiv(), "index");
      grid.createDiv({
        text: "Index of current interval",
      });
    }

    this.renderVariable(grid.createDiv(), "current_date");
    const current_date = grid.createDiv({
      text: "Current date (in YYYY-MM-DD format)",
    });
    current_date.createEl("br");
    current_date.createSpan({
      text: "You can also use {{current_date:format}} to override format.",
    });

    this.renderVariable(grid.createDiv(), "time");
    const timediv = grid.createDiv({
      text: "Current time (in HH:mm format)",
    });
    timediv.createEl("br");
    timediv.createSpan({
      text: "You can also use {{time:format}} to override format.",
    });
    this.renderVariable(grid.createDiv(), "current_time");
    const current_time = grid.createDiv({
      text: "Current time (in HH:mm format)",
    });
    current_time.createEl("br");
    current_time.createSpan({
      text: "You can also use {{current_time:format}} to override format.",
    });
  }

  renderVariable(parent: HTMLElement, name: string) {
    parent.createEl("span", {
      cls: "journal-variable",
      text: `{{${name}}}`,
    });
  }
}
