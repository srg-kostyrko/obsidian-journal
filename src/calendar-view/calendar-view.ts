import { ItemView, type WorkspaceLeaf } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import { CALENDAR_VIEW_TYPE, PLUGIN_KEY } from "../constants";
import CalendarViewComponent from "./CalendarView.vue";
import type { JournalPlugin } from "@/types/plugin.types";

export class CalendarView extends ItemView {
  navigation = false;
  #vueApp: VueApp | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: JournalPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return CALENDAR_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Calendar";
  }

  getIcon(): string {
    return "calendar-days";
  }

  protected onOpen(): Promise<void> {
    this.#vueApp = createApp(CalendarViewComponent);
    this.#vueApp.provide(PLUGIN_KEY, this.plugin);
    this.#vueApp.mount(this.contentEl);
    return Promise.resolve();
  }

  protected onClose(): Promise<void> {
    this.#vueApp?.unmount();
    this.#vueApp = null;
    this.contentEl.empty();
    return Promise.resolve();
  }
}
