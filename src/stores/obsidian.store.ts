import type { TFile } from "obsidian";
import { shallowRef } from "vue";

export const activeNote$ = shallowRef<TFile | null>(null);
