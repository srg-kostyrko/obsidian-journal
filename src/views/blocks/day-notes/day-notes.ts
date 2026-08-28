import { CalendarDate, localMoment, type Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, type Note, type NoteMetadata } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { dayNotesSlice, type DayNotesSliceState } from "./slice";

interface DayNotesDependencies {
  readonly notes: Pick<NotesService, "allMarkdownNotes" | "find">;
  readonly metadata: Pick<NoteMetadataService, "get">;
  readonly settings: () => DayNotesSliceState;
}

export interface CreatedNote {
  readonly note: Note;
  readonly created: CalendarDate;
}

export interface DayNotesQuery {
  createdOn(note: Note): CalendarDate;
  notesCreatedIn(period: Period): readonly CreatedNote[];
}

function calendarDateOf(value: Date | number): CalendarDate | null {
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
): CalendarDate {
  const configured = propertyDate(metadata?.properties[settings.property], settings.format);
  if (configured) return configured;

  // Note.ctime is Obsidian's filesystem birth time. Host notes always provide a valid value;
  // the assertion makes the invariant explicit while keeping malformed frontmatter on the
  // documented fallback path above.
  const fallback = calendarDateOf(note.ctime);
  if (!fallback) throw new RangeError(`Invalid note creation timestamp for ${note.path}`);
  return fallback;
}

export function createDayNotesQuery(dependencies: DayNotesDependencies): DayNotesQuery {
  const createdOn = (note: Note): CalendarDate => {
    const metadata = dependencies.metadata.get(note.path).getOrUndefined();
    return resolveCreationDate(note, metadata, dependencies.settings());
  };

  const notesCreatedIn = (period: Period): readonly CreatedNote[] => {
    const matches: CreatedNote[] = [];
    for (const path of dependencies.notes.allMarkdownNotes()) {
      const note = dependencies.notes.find(path);
      if (note.isNone()) continue;
      const created = createdOn(note.value);
      if (period.contains(created)) matches.push({ note: note.value, created });
    }
    return matches;
  };

  return { createdOn, notesCreatedIn };
}

export function useDayNotesQuery(): DayNotesQuery {
  const notes = useService(NotesService);
  const metadata = useService(NoteMetadataService);
  const settings = useService(SettingsService).getSlice(dayNotesSlice);
  return createDayNotesQuery({ notes, metadata, settings: () => settings.state });
}
