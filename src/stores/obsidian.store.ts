import type { App, TFile } from "obsidian";
import { shallowRef } from "vue";
import type { JournalPlugin } from "../types/plugin.types";

export const app$ = shallowRef<App>({} as App);
export const plugin$ = shallowRef<JournalPlugin>({} as JournalPlugin);
export const activeNote$ = shallowRef<TFile | null>(null);
