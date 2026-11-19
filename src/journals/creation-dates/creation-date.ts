import { CalendarDate, localMoment } from "@/calendar";
import type { Note, NoteMetadata } from "@/infrastructure/host";

import type { DayNotesSliceState } from "./slice";

function calendarDateOf(value: Date | number): CalendarDate | null {
  // Sync and some hosts report a file time of 0 for "unknown"; read as a real timestamp it is 1970-01-01.
  if (typeof value === "number" && (!Number.isFinite(value) || value === 0)) return null;
  const parsed = localMoment(value);
  return parsed.isValid() ? CalendarDate._fromMoment(parsed.startOf("day")) : null;
}

function propertyDate(value: unknown, format: string): CalendarDate | null {
  if (value instanceof Date) return calendarDateOf(value);
  if (typeof value !== "string") return null;

  const direct = CalendarDate.parse(value, format);
  if (direct.isOk()) return direct.value;

  const prefix = CalendarDate.parse(value.slice(0, format.length), format);
  return prefix.isOk() ? prefix.value : null;
}

export function resolveCreationDate(
  note: Note,
  metadata: NoteMetadata | undefined,
  settings: DayNotesSliceState,
): CalendarDate | null {
  const configured = propertyDate(metadata?.properties[settings.property], settings.format);
  if (configured) return configured;

  // Note.ctime is Obsidian's filesystem birth time and mtime its modification time. A host
  // that reports neither as a usable timestamp (missing, non-finite or 0) leaves nothing to
  // date the note by, so it drops out of the listing rather than landing on 1970-01-01.
  return calendarDateOf(note.ctime) ?? calendarDateOf(note.mtime);
}
