import { MomentDate } from "../contracts/date.types";

interface IndexEntry {
  path: string;
}
const FORMAT = "YYYY-MM-DD HH:mm";

export class CalendarJournalSectionIndex {
  private index = new Map<string, IndexEntry>();
  private pathToDate = new Map<string, string>();

  get(date: MomentDate): IndexEntry | undefined {
    return this.index.get(date.format(FORMAT));
  }
  set(date: MomentDate, value: IndexEntry): void {
    const key = date.format(FORMAT);
    this.index.set(key, value);
    this.pathToDate.set(value.path, key);
  }
  clearForPath(path: string): void {
    const key = this.pathToDate.get(path);
    if (key) {
      this.index.delete(key);
      this.pathToDate.delete(path);
    }
  }
}
