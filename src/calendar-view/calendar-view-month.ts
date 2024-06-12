import { Menu, getIcon, setTooltip } from "obsidian";
import { MomentDate } from "../contracts/date.types";
import { JournalManager } from "../journal-manager";
import { DatePickerModal } from "../ui/date-picker-modal";
import { CalendarJournal } from "../calendar-journal/calendar-journal";
import { CalendarGranularity, JournalFrontMatter } from "../contracts/config.types";
import { IntervalJournal } from "../interval-journal/interval-journal";
import { replaceTemplateVariables } from "../utils/template";
import { Interval } from "../interval-journal/interval-manager";
import { delay } from "../utils/misc";

interface NoteIndexentry {
  journalId: string;
  granularity: CalendarGranularity;
  path: string;
}
const INDEX_FORMATS: Record<CalendarGranularity, string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]ww",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
};

export class CalendarViewMonth {
  private currentDate: MomentDate;
  private notesIndex = new Map<string, NoteIndexentry[]>();
  private activeFile: JournalFrontMatter | null;

  constructor(
    private containerEl: HTMLElement,
    private manager: JournalManager,
  ) {
    this.changeCurrentDate(this.manager.calendar.today());

    this.manager.plugin.registerEvent(
      this.manager.app.workspace.on("journal:settings-save", async () => {
        await this.updateActiveNote();
        this.display();
      }),
    );

    this.manager.plugin.registerEvent(
      this.manager.app.workspace.on("journal:index-update", async () => {
        this.updateNotesIndex();
        await this.updateActiveNote();
        // delaying render to allow templates and other dataview queries to run
        await delay(500);
        this.display();
      }),
    );
    this.manager.plugin.registerEvent(
      this.manager.app.vault.on("create", async () => {
        this.manager.reindex();
      }),
    );
    this.manager.plugin.registerEvent(
      this.manager.app.vault.on("delete", async () => {
        this.manager.reindex();
      }),
    );
    this.manager.plugin.registerEvent(
      this.manager.app.workspace.on("file-open", async () => {
        await this.updateActiveNote();
        this.display();
      }),
    );

    this.manager.plugin.registerEvent(
      this.manager.app.workspace.on("active-leaf-change", async () => {
        await this.updateActiveNote();
        // delaying render to avoid missed clicks
        await delay(100);
        this.display();
      }),
    );

    this.manager.app.workspace.onLayoutReady(async () => {
      await this.updateActiveNote();
      this.display();
    });

    this.updateActiveNote().then(() => {
      this.display();
    });
  }

  display(): void {
    this.containerEl.empty();
    const calendarJournals = this.manager.getByType("calendar");
    const active = this.computedActive(calendarJournals);
    const placeWeeks = this.manager.config.calendarView.weeks || "left";

    const calendar = this.manager.calendar;
    const today = calendar.today();

    const start = this.currentDate.clone().startOf("month");
    const end = this.currentDate.clone().endOf("month");

    const startWithWeek = start.clone().startOf("week");
    const endWithWeek = end.clone().endOf("week");

    const toolbar = this.containerEl.createEl("div", {
      cls: "journal-calendar-view-toolbar",
    });
    this.renderToolbar(toolbar);
    //

    const titleRow = this.containerEl.createEl("div", {
      cls: "journal-calendar-view-title-row",
    });
    this.renderTitleRow(titleRow, start, active);

    const view = this.containerEl.createDiv({
      cls: "journal-calendar-view-month",
    });

    const week = start.clone().startOf("week");
    const weekEnd = week.clone().endOf("week");

    if (placeWeeks !== "none") {
      view.classList.add("with-week");
    }
    if (active.week) {
      view.on("click", ".journal-weeknumber", (e) => {
        const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
        if (date) {
          this.openDate(date, "week", e);
        }
      });
      view.on("contextmenu", ".journal-weeknumber", (e) => {
        const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
        if (date) {
          this.showDateContextMenu(date, "week", e);
        }
      });
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

    if (active.day) {
      view.on("click", ".journal-day", (e) => {
        const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
        if (date) {
          this.openDate(date, "day", e);
        }
      });
      view.on("contextmenu", ".journal-day", (e) => {
        const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
        if (date) {
          this.showDateContextMenu(date, "day", e);
        }
      });
    }

    const curr = startWithWeek.clone();
    while (curr.isSameOrBefore(endWithWeek)) {
      if (placeWeeks === "left" && curr.isSame(curr.clone().startOf("week"), "day")) {
        this.renderWeekNumber(view, curr, active.week);
      }
      const cls = ["journal-day"];
      const text = curr.format("D");
      if (curr.isSame(today, "day")) {
        cls.push("journal-is-today");
      }
      if (this.checkIsActiveCalendar(curr, "day")) {
        cls.push("journal-is-active");
      }
      if (!curr.isSame(start, "month")) {
        cls.push("journal-is-not-same-month");
      }
      if (active.day) {
        cls.push("journal-clickable");
      }
      const day = view.createDiv({
        cls,
        text,
      });
      day.dataset.date = curr.format("YYYY-MM-DD");
      if (this.checkHasNote(curr, "day")) {
        this.renderNoteMarker(day);
      }

      if (placeWeeks === "right" && curr.isSame(curr.clone().endOf("week"), "day")) {
        this.renderWeekNumber(view, curr, active.week);
      }

      curr.add(1, "day");
    }

    this.containerEl.createDiv({
      cls: "journal-separator",
    });
    this.renderIntervals(this.containerEl);
  }

  private changeCurrentDate(date: MomentDate): void {
    this.currentDate = date;
    this.updateNotesIndex();
    this.display();
  }

  private updateNotesIndex(): void {
    this.notesIndex.clear();
    const start = this.currentDate.clone().startOf("month").startOf("week");
    const end = this.currentDate.clone().endOf("month").endOf("week");

    const journals = this.manager.getByType("calendar");
    for (const journal of journals) {
      const notes = journal.index.find(start, end);
      for (const note of notes) {
        const indexKey = this.manager.calendar.date(note.startDate).format(INDEX_FORMATS[note.granularity]);
        if (!this.notesIndex.has(indexKey)) {
          this.notesIndex.set(indexKey, []);
        }
        this.notesIndex.get(indexKey)?.push({
          journalId: journal.id,
          granularity: note.granularity,
          path: note.path,
        });
      }
    }
  }

  private async updateActiveNote() {
    const file = this.manager.app.workspace.getActiveFile();
    if (file) {
      const data = await this.manager.getJournalData(file.path);
      if (data) {
        this.activeFile = data;
        this.currentDate = this.manager.calendar.date(data.start_date);
      } else {
        this.activeFile = null;
      }
    } else {
      this.activeFile = null;
    }
  }

  private checkHasNote(date: MomentDate, granularity: CalendarGranularity): boolean {
    const indexKey = date.format(INDEX_FORMATS[granularity]);
    return this.notesIndex.has(indexKey);
  }

  private checkIsActiveCalendar(date: MomentDate, granularity: CalendarGranularity): boolean {
    if (!this.activeFile) return false;
    if (this.activeFile.type !== "calendar") return false;
    if (this.activeFile.granularity !== granularity) return false;
    return date.isSame(this.activeFile.start_date, granularity);
  }

  private checkIsActiveInterval(id: string, date: MomentDate): boolean {
    if (!this.activeFile) return false;
    if (this.activeFile.type !== "interval") return false;
    if (this.activeFile.id !== id) return false;
    return date.isSame(this.activeFile.start_date, "day");
  }

  private openDate(date: string, garnularity: CalendarGranularity, event: MouseEvent): void {
    const journals = this.manager.getByType("calendar").filter((j) => j.config[garnularity].enabled);
    journals.sort((a, b) => a.name.localeCompare(b.name));
    if (journals.length > 0) {
      if (journals.length === 1) {
        journals[0][garnularity].open(date);
      } else {
        const menu = new Menu();
        for (const journal of journals) {
          menu.addItem((item) => {
            item.setTitle(journal.name).onClick(() => {
              journal[garnularity].open(date);
            });
          });
        }
        menu.showAtMouseEvent(event);
      }
    }
  }

  private showDateContextMenu(dateString: string, granularity: CalendarGranularity, event: MouseEvent): void {
    const date = this.manager.calendar.date(dateString);
    const indexKey = date.format(INDEX_FORMATS[granularity]);
    const notes = this.notesIndex.get(indexKey);
    if (!notes) return;
    if (notes.length === 1) {
      this.showContextMenuForPath(notes[0].path, event);
    } else {
      const menu = new Menu();
      for (const note of notes) {
        menu.addItem((item) => {
          item.setTitle(note.path).onClick(() => {
            this.showContextMenuForPath(note.path, event);
          });
        });
      }
      menu.showAtMouseEvent(event);
    }
  }

  private showContextMenuForPath(path: string, event: MouseEvent): void {
    const file = this.manager.app.vault.getAbstractFileByPath(path);
    if (file) {
      const menu = new Menu();
      this.manager.app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", null);
      menu.showAtMouseEvent(event);
    }
  }

  private computedActive(journals: CalendarJournal[]): Record<CalendarGranularity, boolean> {
    const active: Record<CalendarGranularity, boolean> = {
      day: false,
      week: false,
      month: false,
      quarter: false,
      year: false,
    };
    for (const journal of journals) {
      if (!active.day && journal.config.day.enabled) {
        active.day = true;
      }
      if (!active.week && journal.config.week.enabled) {
        active.week = true;
      }
      if (!active.month && journal.config.month.enabled) {
        active.month = true;
      }
      if (!active.quarter && journal.config.quarter.enabled) {
        active.quarter = true;
      }
      if (!active.year && journal.config.year.enabled) {
        active.year = true;
      }
    }

    return active;
  }

  private renderTitleIcon(parent: HTMLElement, icon: string, tooltip: string, callback: () => void): void {
    const cls = `journal-${icon}`;
    const iconWrapper = parent.createDiv({
      cls: `journal-clickable ${cls}`,
    });
    iconWrapper.on("click", `.${cls}`, callback);
    const iconEl = getIcon(icon);
    if (iconEl) {
      iconWrapper.appendChild(iconEl);
      setTooltip(iconWrapper, tooltip);
    }
  }

  private renderToolbar(toolbar: HTMLElement) {
    this.renderTitleIcon(toolbar, "crosshair", "Pick date", () => {
      new DatePickerModal(
        this.manager.app,
        this.manager,
        (date: string, e: MouseEvent) => {
          this.changeCurrentDate(this.manager.calendar.date(date));
          this.openDate(date, "day", e);
        },
        this.currentDate.format("YYYY-MM-DD"),
      ).open();
    });
    toolbar.createEl("button", {
      cls: "journal-calendar-view-today",
      text: "Today",
    });
    toolbar.on("click", ".journal-calendar-view-today", (e) => {
      this.changeCurrentDate(this.manager.calendar.today());
      this.openDate(this.manager.calendar.today().format("YYYY-MM-DD"), "day", e);
    });
  }

  private renderTitleRow(titleRow: HTMLElement, start: MomentDate, active: Record<CalendarGranularity, boolean>) {
    this.renderTitleIcon(titleRow, "chevrons-left", "Previous year", () => {
      this.changeCurrentDate(this.currentDate.subtract(1, "year"));
    });

    this.renderTitleIcon(titleRow, "chevron-left", "Previous month", () => {
      this.changeCurrentDate(this.currentDate.subtract(1, "month"));
    });

    const titleText = titleRow.createDiv({
      cls: "journal-calendar-view-title-text",
    });
    const month = titleText.createDiv({
      cls: "journal-month",
      text: start.format("MMMM"),
    });
    if (active.month) {
      month.classList.add("journal-clickable");
      month.dataset.date = start.format("YYYY-MM");
      if (this.checkIsActiveCalendar(start, "month")) {
        month.classList.add("journal-is-active");
      }
      titleRow.on("click", ".journal-month", (e) => {
        const date = (e.target as HTMLElement).dataset.date;
        if (date) {
          this.openDate(date, "month", e);
        }
      });
      titleRow.on("contextmenu", ".journal-month", (e) => {
        const date = (e.target as HTMLElement).dataset.date;
        if (date) {
          this.showDateContextMenu(date, "month", e);
        }
      });
      if (this.checkHasNote(start, "month")) {
        this.renderNoteMarker(month);
      }
    }
    if (active.quarter) {
      const quarter = titleText.createDiv({
        cls: "journal-quarter journal-clickable",
        text: start.format("[Q]Q"),
      });
      quarter.dataset.date = start.format("YYYY-MM");
      if (this.checkIsActiveCalendar(start, "quarter")) {
        quarter.classList.add("journal-is-active");
      }
      titleRow.on("click", ".journal-quarter", (e) => {
        const date = (e.target as HTMLElement).dataset.date;
        if (date) {
          this.openDate(date, "quarter", e);
        }
      });
      titleRow.on("contextmenu", ".journal-quarter", (e) => {
        const date = (e.target as HTMLElement).dataset.date;
        if (date) {
          this.showDateContextMenu(date, "quarter", e);
        }
      });
      if (this.checkHasNote(start, "quarter")) {
        this.renderNoteMarker(quarter);
      }
    }
    const year = titleText.createDiv({
      cls: "journal-year",
      text: start.format("YYYY"),
    });
    if (active.year) {
      year.classList.add("journal-clickable");
      year.dataset.date = start.format("YYYY");
      if (this.checkIsActiveCalendar(start, "year")) {
        year.classList.add("journal-is-active");
      }
      titleRow.on("click", ".journal-year", (e) => {
        const date = (e.target as HTMLElement).dataset.date;
        if (date) {
          this.openDate(date, "year", e);
        }
      });
      titleRow.on("contextmenu", ".journal-year", (e) => {
        const date = (e.target as HTMLElement).dataset.date;
        if (date) {
          this.showDateContextMenu(date, "year", e);
        }
      });
      if (this.checkHasNote(start, "year")) {
        this.renderNoteMarker(year);
      }
    }

    this.renderTitleIcon(titleRow, "chevron-right", "Next month", () => {
      this.changeCurrentDate(this.currentDate.add(1, "month"));
    });

    this.renderTitleIcon(titleRow, "chevrons-right", "Next year", () => {
      this.changeCurrentDate(this.currentDate.add(1, "year"));
    });
  }

  private renderWeekNumber(parent: HTMLElement, curr: MomentDate, active: boolean) {
    const weekNumber = parent.createDiv({
      cls: "journal-weeknumber",
      text: curr.format("[W]ww"),
    });
    if (active) {
      weekNumber.classList.add("journal-clickable");
    }
    weekNumber.dataset.date = curr.format("YYYY-MM-DD");
    if (this.checkIsActiveCalendar(curr, "week")) {
      weekNumber.classList.add("journal-is-active");
    }
    if (this.checkHasNote(curr, "week")) {
      this.renderNoteMarker(weekNumber);
    }
  }

  private renderNoteMarker(parent: HTMLElement) {
    parent.createDiv({
      cls: "journal-note-marker",
    });
  }

  private renderIntervals(parent: HTMLElement) {
    const intervalJournals = this.manager.getByType("interval");
    for (const intervalJournal of intervalJournals) {
      this.renderIntervalJournal(parent, intervalJournal);
    }
  }

  private renderIntervalJournal(parent: HTMLElement, journal: IntervalJournal) {
    const block = parent.createDiv({
      cls: "journal-interval-block",
    });
    block.createEl("h5", {
      text: journal.name,
    });
    const start = this.currentDate.clone().startOf("month").startOf("week");
    const end = this.currentDate.clone().endOf("month").endOf("week");
    const notes = journal.intervals.find(start, end);
    const index: Record<string, Interval> = {};
    for (const note of notes) {
      const key = note.startDate.format("YYYY-MM-DD");
      index[key] = note;
    }

    block.on("click", ".journal-interval", (e) => {
      const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
      if (date) {
        journal.open(date);
      }
    });
    block.on("contextmenu", ".journal-interval", (e) => {
      const date = (e.target as HTMLElement).closest<HTMLElement>("[data-date]")?.dataset?.date;
      if (date) {
        const note = index[date];
        if (note?.path) {
          this.showContextMenuForPath(note.path, e);
        }
      }
    });

    const intervals = journal.findIntervalsForPeriod(start, end);
    if (journal.config.calendar_view?.order === "reverse") {
      intervals.reverse();
    }

    for (const interval of intervals) {
      const intervalEl = block.createDiv({
        cls: "journal-interval journal-clickable",
      });
      intervalEl.dataset.date = interval.startDate.format("YYYY-MM-DD");
      if (this.checkIsActiveInterval(journal.id, interval.startDate)) {
        intervalEl.classList.add("journal-is-active");
      }
      if (
        interval.startDate.isSameOrBefore(this.manager.calendar.today(), "day") &&
        interval.endDate.isSameOrAfter(this.manager.calendar.today(), "day")
      ) {
        intervalEl.classList.add("journal-is-current-interval");
      }

      const context = journal.getTemplateContext(interval);
      const name = replaceTemplateVariables(journal.navNameTemplate, context);
      const nameEl = intervalEl.createDiv({
        cls: "journal-interval-name",
        text: name,
      });
      if (index[interval.startDate.format("YYYY-MM-DD")]) {
        this.renderNoteMarker(nameEl);
      }
      const dates = replaceTemplateVariables(journal.navDatesTemplate, context).replaceAll("|", " ");
      intervalEl.createDiv({
        cls: "journal-interval-dates",
        text: dates,
      });
    }
  }
}
