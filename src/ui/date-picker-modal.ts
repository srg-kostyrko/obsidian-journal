import { App, Modal, getIcon } from "obsidian";
import { MomentDate } from "../contracts/date.types";
import { CalendarGranularity } from "../contracts/config.types";
import { JournalManager } from "../journal-manager";

export class DatePickerModal extends Modal {
  private mode = "month";
  private selected = "";
  private currentDate: MomentDate;

  constructor(
    app: App,
    private manager: JournalManager,
    private cb: (date: string, event: MouseEvent) => void,
    private selectedDate?: string | null,
    private granularity: CalendarGranularity = "day",
  ) {
    super(app);
    if (this.selectedDate) {
      this.selected = this.selectedDate;
      this.currentDate = this.manager.calendar.date(this.selected).startOf("month");
    } else {
      this.currentDate = this.manager.calendar.today().startOf("month");
    }

    switch (granularity) {
      case "day":
        this.mode = "month";
        break;
      case "week":
        this.mode = "month";
        break;
      case "month":
        this.mode = "year";
        break;
      case "year":
        this.mode = "decade";
        break;
      case "quarter":
        this.mode = "quarter";
        break;
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
      case "quarter":
        this.displayQuarter(contentEl);
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
    const today = this.manager.calendar.today();
    const startWithWeek = this.currentDate.clone().startOf("week");
    const endWithWeek = this.currentDate.clone().endOf("month").endOf("week");

    this.renderName(contentEl, "MMMM YYYY", "month", "year");

    const view = contentEl.createDiv({
      cls: "journal-month-view",
    });
    view.on("click", ".journal-day", (e) => {
      const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
      if (date) {
        this.cb(date, e);
        this.close();
      }
    });

    const week = startWithWeek.clone().startOf("week");
    const weekEnd = week.clone().endOf("week");

    const placeWeeks = this.manager.config.calendarView.weeks || "left";
    if (placeWeeks !== "none") {
      view.classList.add("with-week");
    }

    if (placeWeeks === "left") view.createDiv();
    while (week.isSameOrBefore(weekEnd)) {
      view.createDiv({
        cls: "journal-weekday",
        text: week.format("ddd"),
      });
      week.add(1, "day");
    }
    if (placeWeeks === "right") view.createDiv();

    const curr = startWithWeek.clone();
    while (curr.isSameOrBefore(endWithWeek)) {
      if (placeWeeks === "left" && curr.isSame(curr.clone().startOf("week"), "day")) {
        this.renderWeekNumber(view, curr);
      }
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
      if (placeWeeks === "right" && curr.isSame(curr.clone().endOf("week"), "day")) {
        this.renderWeekNumber(view, curr);
      }
      curr.add(1, "day");
    }
  }

  private renderWeekNumber(parent: HTMLElement, curr: MomentDate) {
    const weekNumber = parent.createDiv({
      cls: "journal-weeknumber",
      text: curr.format("[W]ww"),
    });
    weekNumber.dataset.date = curr.format("YYYY-MM-DD");
  }

  displayQuarter(contentEl: HTMLElement) {
    const start = this.currentDate.clone().startOf("year").startOf("quarter");
    const end = this.currentDate.clone().endOf("year");

    this.renderName(contentEl, "YYYY", "year", "quarter");

    const view = contentEl.createDiv({
      cls: "journal-dp-quarters-view",
    });
    view.on("click", ".journal-dp-quarter", (e) => {
      const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
      if (date) {
        this.currentDate = this.manager.calendar.date(date);
        this.cb(this.currentDate.startOf("quarter").format("YYYY-MM-DD"), e);
        this.close();
      }
    });

    const curr = start.clone();
    while (curr.isSameOrBefore(end, "year")) {
      view.createEl("button", {
        cls: "journal-dp-quarter journal-clickable",
        text: curr.format("[Q]Q"),
        attr: {
          "data-date": curr.format("YYYY-MM-DD"),
        },
      });
      curr.add(1, "quarter");
    }
  }

  displayYear(contentEl: HTMLElement) {
    const start = this.currentDate.clone().startOf("year");
    const end = this.currentDate.clone().endOf("year");

    this.renderName(contentEl, "YYYY", "year", "decade");

    const view = contentEl.createDiv({
      cls: "journal-dp-year-view",
    });
    view.on("click", ".journal-dp-month", (e) => {
      const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
      if (date) {
        this.currentDate = this.manager.calendar.date(date);
        if (this.granularity === "month") {
          this.cb(this.currentDate.startOf("month").format("YYYY-MM-DD"), e);
          this.close();
        } else {
          this.mode = "month";
          this.display();
        }
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

    const nameRow = contentEl.createDiv({
      cls: "journal-dp-name-row",
    });
    const prevButton = nameRow.createEl("button", {
      cls: `clickable-icon journal-dp-prev-decade journal-clickable`,
    });
    prevButton.on("click", `.journal-dp-prev-decade`, () => {
      this.currentDate.year(this.currentDate.year() - 10);
      this.display();
    });
    const prevIcon = getIcon("arrow-left");
    if (prevIcon) prevButton.appendChild(prevIcon);

    nameRow.createDiv({
      cls: `journal-dp-decade-name `,
      text: `${startYear} - ${endYear}`,
    });

    const nextButton = nameRow.createEl("button", {
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
        if (this.granularity === "year") {
          this.cb(this.currentDate.startOf("year").format("YYYY-MM-DD"), e);
          this.close();
        } else {
          this.mode = "year";
          this.display();
        }
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

  renderName(contentEl: HTMLElement, format: string, granularity: CalendarGranularity, mode: string) {
    const nameRow = contentEl.createDiv({
      cls: "journal-dp-name-row",
    });
    const prevButton = nameRow.createEl("button", {
      cls: `clickable-icon journal-dp-prev-${granularity} journal-clickable`,
    });
    prevButton.on("click", `.journal-dp-prev-${granularity}`, () => {
      this.currentDate.subtract(1, granularity);
      this.display();
    });
    const prevIcon = getIcon("arrow-left");
    if (prevIcon) prevButton.appendChild(prevIcon);

    const monthName = nameRow.createEl("button", {
      cls: `journal-dp-${granularity}-name journal-clickable`,
      text: this.currentDate.format(format),
    });
    monthName.on("click", `.journal-dp-${granularity}-name`, () => {
      this.mode = mode;
      this.display();
    });

    const nextButton = nameRow.createEl("button", {
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
