import { ItemView } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import { CALENDAR_VIEW_TYPE } from "../constants";
import CalendarViewComponent from "./CalendarView.vue";

export class CalendarView extends ItemView {
  navigation = false;
  #vueApp: VueApp | null = null;

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
