import type { CalendarDate, Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, type Note } from "@/infrastructure/host";
import { dayNotesSlice, resolveCreationDate, type DayNotesSliceState } from "@/journals/creation-dates";
import { SettingsService } from "@/settings";

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
  createdOn(note: Note): CalendarDate | null;
  notesCreatedIn(period: Period): readonly CreatedNote[];
}

export function createDayNotesQuery(dependencies: DayNotesDependencies): DayNotesQuery {
  const createdOn = (note: Note): CalendarDate | null => {
    const metadata = dependencies.metadata.get(note.path).getOrUndefined();
    return resolveCreationDate(note, metadata, dependencies.settings());
  };

  const notesCreatedIn = (period: Period): readonly CreatedNote[] => {
    const matches: CreatedNote[] = [];
    for (const path of dependencies.notes.allMarkdownNotes()) {
      const note = dependencies.notes.find(path);
      if (note.isNone()) continue;
      const created = createdOn(note.value);
      if (created && period.contains(created)) matches.push({ note: note.value, created });
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
