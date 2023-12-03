import { App, Modal, getIcon } from "obsidian";
import { CalendarHelper } from "../utils/calendar";
import { MomentDate } from "../contracts/date.types";
import { CalendarGranularity } from "../contracts/config.types";

export class DatePickerModal extends Modal {
  private mode = "month";
  private selected = "";
  private currentDate: MomentDate;

  constructor(
    app: App,
    private calendar: CalendarHelper,
    private cb: (date: string) => void,
    private selectedDate?: string,
  ) {
    super(app);
    if (this.selectedDate) {
      this.selected = this.selectedDate;
      this.currentDate = this.calendar.date(this.selected).startOf("month");
    } else {
      this.currentDate = this.calendar.today().startOf("month");
    }
  }

  onOpen(): void {
    this.display();
    this.titleEl.setText("Select Date");
    this.modalEl.classList.add("journal-date-picker-modal");
  }
  display(): void {
    const { contentEl } = this;
    contentEl.empty();
    switch (this.mode) {
      case "month":
        this.displayMonth(contentEl);
        break;
      case "year":
        this.displayYear(contentEl);
        break;
      case "decade":
        this.displayDecade(contentEl);
        break;
    }
  }

  displayMonth(contentEl: HTMLElement) {
    const today = this.calendar.today();
    const startWithWeek = this.currentDate.clone().startOf("week");
    const endWithWeek = this.currentDate.clone().endOf("month").endOf("week");

    this.renderTitle(contentEl, "MMMM YYYY", "month", "year");

    const view = contentEl.createDiv({
      cls: "journal-month-view",
    });
    view.on("click", ".journal-day", (e) => {
      const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
      if (date) {
        this.cb(date);
        this.close();
      }
    });

    const week = startWithWeek.clone().startOf("week");
    const weekEnd = week.clone().endOf("week");

    while (week.isSameOrBefore(weekEnd)) {
      view.createDiv({
        cls: "journal-weekday",
        text: week.format("ddd"),
      });
      week.add(1, "day");
    }
    const curr = startWithWeek.clone();
    while (curr.isSameOrBefore(endWithWeek)) {
      const cls = ["journal-day", "journal-clickable"];
      if (curr.isSame(today, "day")) {
        cls.push("journal-is-today");
      }
      if (!curr.isSame(this.currentDate, "month")) {
        cls.push("journal-is-not-same-month");
      }
      const day = view.createDiv({
        cls,
        text: curr.format("D"),
      });
      day.dataset.date = curr.format("YYYY-MM-DD");
      if (this.selected === day.dataset.date) {
        day.classList.add("journal-is-selected");
      }
      curr.add(1, "day");
    }
  }

  displayYear(contentEl: HTMLElement) {
    const start = this.currentDate.clone().startOf("year");
    const end = this.currentDate.clone().endOf("year");

    this.renderTitle(contentEl, "YYYY", "year", "decade");

    const view = contentEl.createDiv({
      cls: "journal-dp-year-view",
    });
    view.on("click", ".journal-dp-month", (e) => {
      const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
      if (date) {
        this.currentDate = this.calendar.date(date);
        this.mode = "month";
        this.display();
      }
    });

    const curr = start.clone();
    while (curr.isSameOrBefore(end, "year")) {
      view.createEl("button", {
        cls: "journal-dp-month journal-clickable",
        text: curr.format("MMMM"),
        attr: {
          "data-date": curr.format("YYYY-MM-DD"),
        },
      });
      curr.add(1, "month");
    }
  }

  displayDecade(contentEl: HTMLElement) {
    const startYear = this.currentDate.year() - (this.currentDate.year() % 10);
    const endYear = startYear + 9;

    const titleRow = contentEl.createDiv({
      cls: "journal-dp-title-row",
    });
    const prevButton = titleRow.createEl("button", {
      cls: `clickable-icon journal-dp-prev-decade journal-clickable`,
    });
    prevButton.on("click", `.journal-dp-prev-decade`, () => {
      this.currentDate.year(this.currentDate.year() - 10);
      this.display();
    });
    const prevIcon = getIcon("arrow-left");
    if (prevIcon) prevButton.appendChild(prevIcon);

    titleRow.createDiv({
      cls: `journal-dp-decade-title `,
      text: `${startYear} - ${endYear}`,
    });

    const nextButton = titleRow.createEl("button", {
      cls: `clickable-icon journal-dp-next-decade journal-clickable`,
    });
    nextButton.on("click", `.journal-dp-next-decade`, () => {
      this.currentDate.year(this.currentDate.year() + 10);
      this.display();
    });
    const nextIcon = getIcon("arrow-right");
    if (nextIcon) nextButton.appendChild(nextIcon);

    const view = contentEl.createDiv({
      cls: "journal-dp-decade-view",
    });
    view.on("click", ".journal-dp-year", (e) => {
      const year = (e.target as HTMLElement).closest<HTMLElement>("[data-year]")?.dataset?.year;
      if (year) {
        this.currentDate.year(parseInt(year, 10));
        this.mode = "year";
        this.display();
      }
    });

    for (let i = startYear - 1; i <= endYear + 1; i++) {
      const yearButton = view.createEl("button", {
        cls: `journal-dp-year journal-clickable`,
        text: i.toString(),
        attr: {
          "data-year": i,
        },
      });
      if (i < startYear || i > endYear) {
        yearButton.classList.add("journal-out-of-range");
      }
    }
  }

  renderTitle(contentEl: HTMLElement, format: string, granularity: CalendarGranularity, mode: string) {
    const titleRow = contentEl.createDiv({
      cls: "journal-dp-title-row",
    });
    const prevButton = titleRow.createEl("button", {
      cls: `clickable-icon journal-dp-prev-${granularity} journal-clickable`,
    });
    prevButton.on("click", `.journal-dp-prev-${granularity}`, () => {
      this.currentDate.subtract(1, granularity);
      this.display();
    });
    const prevIcon = getIcon("arrow-left");
    if (prevIcon) prevButton.appendChild(prevIcon);

    const monthTitle = titleRow.createEl("button", {
      cls: `journal-dp-${granularity}-title journal-clickable`,
      text: this.currentDate.format(format),
    });
    monthTitle.on("click", `.journal-dp-${granularity}-title`, () => {
      this.mode = mode;
      this.display();
    });

    const nextButton = titleRow.createEl("button", {
      cls: `clickable-icon journal-dp-next-${granularity} journal-clickable`,
    });
    nextButton.on("click", `.journal-dp-next-${granularity}`, () => {
      this.currentDate.add(1, granularity);
      this.display();
    });
    const nextIcon = getIcon("arrow-right");
    if (nextIcon) nextButton.appendChild(nextIcon);
  }
}
