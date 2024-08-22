import type { App } from "obsidian";
import { shallowRef } from "vue";
import type { JournalPlugin } from "../types/plugin.types";

export const app$ = shallowRef<App>({} as App);
export const plugin$ = shallowRef<JournalPlugin>({} as JournalPlugin);
