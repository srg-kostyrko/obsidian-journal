import type { App } from "obsidian";
import { shallowRef } from "vue";

export const app$ = shallowRef<App>({} as App);
