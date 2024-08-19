import { computed, ref } from "vue";
import type { PluginSettings } from "../types/settings.types";
import { defaultPluginSettings } from "../defaults";

export const pluginSettings$ = ref<PluginSettings>(structuredClone(defaultPluginSettings));

export const calendarSettings$ = computed(() => pluginSettings$.value.calendar);
