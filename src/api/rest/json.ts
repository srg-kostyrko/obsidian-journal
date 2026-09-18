import type { JournalNote, NoteletNote } from "../public-api";

/** Strips the TFile a JournalNote carries — JSON never ships one. */
export function noteJson(note: JournalNote) {
  return {
    journal: note.journal,
    date: note.date,
    displayDate: note.displayDate,
    endDate: note.endDate,
    path: note.path,
    exists: note.file !== null,
  };
}

export function noteletJson(notelet: NoteletNote) {
  return {
    journal: notelet.journal,
    type: notelet.type,
    date: notelet.date,
    displayDate: notelet.displayDate,
    endDate: notelet.endDate,
    path: notelet.path,
    counter: notelet.counter,
  };
}
