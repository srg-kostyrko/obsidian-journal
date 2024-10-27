import { computed, ref } from "vue";
import type { PluginSettings } from "../types/settings.types";
import { defaultPluginSettings } from "../defaults";
import { deepCopy } from "@/utils/misc";

export const pluginSettings$ = ref<PluginSettings>(deepCopy(defaultPluginSettings));

export const calendarSettings$ = computed(() => pluginSettings$.value.calendar);
export const calendarViewSettings$ = computed(() => pluginSettings$.value.calendarView);

export const journals$ = computed(() => ({ ...pluginSettings$.value.journals }));
export const journalsList$ = computed(() => Object.values(journals$.value));
