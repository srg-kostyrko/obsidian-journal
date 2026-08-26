import { computed, ref, watch, type Ref } from "vue";

import { CalendarDate, type AnchorString } from "@/calendar";
import { calendarDisplaySlice, type VaultDayNotesSort } from "@/calendar/settings/display-slice";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { useVaultDayNotes } from "./use-vault-day-notes";

export function useDayNotesPanel(
  selectedShelf: Readonly<Ref<string | null>>,
  onNavigate?: (anchor: AnchorString) => void,
) {
  const settings = useService(SettingsService).getSlice(calendarDisplaySlice);
  const enabled = computed(() => settings.state.vaultDayNotes);
  const selectedAnchor = ref<AnchorString | null>(null);
  const keepOpenOnEmpty = ref(false);
  const sort = computed({
    get: () => settings.state.vaultDayNotesSort,
    set: (vaultDayNotesSort: VaultDayNotesSort) => {
      settings.state = { ...settings.state, vaultDayNotesSort };
    },
  });
  const includeJournals = computed({
    get: () => settings.state.vaultDayNotesIncludeJournals,
    set: (vaultDayNotesIncludeJournals: boolean) => {
      settings.state = { ...settings.state, vaultDayNotesIncludeJournals };
    },
  });
  const { allNotes, notes } = useVaultDayNotes(selectedAnchor, sort, includeJournals, selectedShelf);

  function close(): void {
    selectedAnchor.value = null;
    keepOpenOnEmpty.value = false;
  }

  function select(anchor: AnchorString): void {
    if (!enabled.value) return;
    keepOpenOnEmpty.value = false;
    selectedAnchor.value = anchor;
    if (notes.value.length === 0) close();
  }

  function navigate(days: -1 | 1): void {
    const current = selectedAnchor.value;
    if (current === null) return;
    keepOpenOnEmpty.value = true;
    const next = CalendarDate.fromAnchor(current).shift(days, "d").toAnchor();
    selectedAnchor.value = next;
    onNavigate?.(next);
  }

  function previous(): void {
    navigate(-1);
  }

  function next(): void {
    navigate(1);
  }

  watch(enabled, (value) => {
    if (!value) close();
  });
  watch(allNotes, (value) => {
    if (selectedAnchor.value !== null && value.length === 0 && !keepOpenOnEmpty.value) close();
  });

  return { enabled, selectedAnchor, sort, includeJournals, notes, select, previous, next, close };
}
