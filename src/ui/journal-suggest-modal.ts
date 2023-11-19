import { App, SuggestModal } from "obsidian";
import { CalendarJournal } from "../calendar-journal/calendar-journal";

export class JournalSuggestModal extends SuggestModal<CalendarJournal> {
  constructor(
    app: App,
    private calendars: CalendarJournal[],
    private cb: (journal: CalendarJournal) => void,
  ) {
    super(app);
  }

  getSuggestions(query: string): CalendarJournal[] | Promise<CalendarJournal[]> {
    query = query.toLocaleLowerCase();
    return this.calendars.filter((journal) => journal.config.name.toLocaleLowerCase().contains(query));
  }
  renderSuggestion(value: CalendarJournal, el: HTMLElement) {
    el.setText(value.config.name);
  }
  onChooseSuggestion(item: CalendarJournal) {
    this.cb(item);
  }
}
