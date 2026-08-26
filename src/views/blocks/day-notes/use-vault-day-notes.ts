import { computed, onMounted, onUnmounted, shallowRef, type Ref } from "vue";

import type { AnchorString } from "@/calendar";
import type { VaultDayNotesSort } from "@/calendar/settings/display-slice";
import { useService } from "@/infrastructure/di";
import { NotesService, type Note } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals";
import { ShelvesService } from "@/shelves";

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export interface VaultDayNote extends Note {
  readonly journalName?: string;
  readonly shelfName?: string;
}

export function localCreationAnchor(timestamp: number): AnchorString {
  const date = new Date(timestamp);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as AnchorString;
}

export function sortVaultDayNotes(notes: readonly Note[], sort: VaultDayNotesSort): Note[] {
  const direction = sort.endsWith("-desc") ? -1 : 1;
  return notes.toSorted((left, right) => {
    const primary = sort.startsWith("modified")
      ? left.mtime - right.mtime
      : nameCollator.compare(left.basename, right.basename);
    if (primary !== 0) return primary * direction;
    return nameCollator.compare(left.path, right.path);
  });
}

export function findVaultNotesCreatedOn(
  notes: Pick<NotesService, "allMarkdownNotes" | "find">,
  anchor: AnchorString | null,
  sort: VaultDayNotesSort,
): Note[] {
  if (anchor === null) return [];
  const matches: Note[] = [];
  for (const path of notes.allMarkdownNotes()) {
    const note = notes.find(path);
    if (note.isSome() && localCreationAnchor(note.value.ctime) === anchor) matches.push(note.value);
  }
  return sortVaultDayNotes(matches, sort);
}

export function filterJournalNotes(
  notes: readonly Note[],
  journals: Pick<JournalsIndex, "entryByPath">,
  shelves: Pick<ShelvesService, "shelfOf">,
  includeJournals: boolean,
  selectedShelf: string | null,
): readonly VaultDayNote[] {
  const visible: VaultDayNote[] = [];
  for (const note of notes) {
    const entry = journals.entryByPath(note.path);
    if (entry.isNone()) {
      visible.push(note);
      continue;
    }
    if (!includeJournals) continue;
    const journalName = entry.value.journalName;
    const shelfName = shelves.shelfOf(journalName) || undefined;
    if (selectedShelf !== null && shelfName !== selectedShelf) continue;
    visible.push({ ...note, journalName, shelfName });
  }
  return visible;
}

export function useVaultDayNotes(
  anchor: Readonly<Ref<AnchorString | null>>,
  sort: Readonly<Ref<VaultDayNotesSort>>,
  includeJournals: Readonly<Ref<boolean>>,
  selectedShelf: Readonly<Ref<string | null>>,
) {
  const notes = useService(NotesService);
  const journals = useService(JournalsIndex);
  const shelves = useService(ShelvesService);
  const notesVersion = shallowRef(0);
  const journalsVersion = shallowRef(0);
  const refreshNotes = (): void => {
    notesVersion.value++;
  };
  const refreshJournals = (): void => {
    journalsVersion.value++;
  };

  onMounted(() => {
    const offCreated = notes.events.on("created", refreshNotes);
    const offModified = notes.events.on("modified", refreshNotes);
    const offRenamed = notes.events.on("renamed", refreshNotes);
    const offDeleted = notes.events.on("deleted", refreshNotes);
    const offJournalChanged = journals.events.on("journalDirty", refreshJournals);
    onUnmounted(() => {
      offCreated();
      offModified();
      offRenamed();
      offDeleted();
      offJournalChanged();
    });
  });

  const allNotes = computed(() => {
    void notesVersion.value;
    return findVaultNotesCreatedOn(notes, anchor.value, sort.value);
  });
  const visibleNotes = computed(() => {
    void journalsVersion.value;
    return filterJournalNotes(allNotes.value, journals, shelves, includeJournals.value, selectedShelf.value);
  });

  return { allNotes, notes: visibleNotes };
}
