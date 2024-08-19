import { computed, ref } from "vue";
import type { JournalSettings, PluginSettings } from "../types/settings.types";
import { defaultJournalSettings, defaultPluginSettings } from "../defaults";
import { prepareJournalDefaultsBasedOnType } from "../journals/journal-defaults";

export const pluginSettings$ = ref<PluginSettings>(structuredClone(defaultPluginSettings));

export const calendarSettings$ = computed(() => pluginSettings$.value.calendar);
export const calendarViewSettings$ = computed(() => pluginSettings$.value.calendarView);

export const journals$ = computed(() => pluginSettings$.value.journals);
export function createJournal(id: string, name: string, write: JournalSettings["write"]): void {
  const settings: JournalSettings = {
    ...structuredClone(defaultJournalSettings),
    ...prepareJournalDefaultsBasedOnType(write),
    id,
    name,
    write,
  };
  pluginSettings$.value.journals[id] = settings;
}

export function removeJournal(id: string): void {
  delete pluginSettings$.value.journals[id];
}
