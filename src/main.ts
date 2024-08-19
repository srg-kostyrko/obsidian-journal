import { Plugin } from "obsidian";
import { calendarSettings$, pluginSettings$ } from "./stores/settings.store";
import { watch, type WatchStopHandle } from "vue";
import { debounce } from "perfect-debounce";
import { initCalendarCustomization, updateLocale } from "./calendar";
import { JournalSettingTab } from "./settings/journal-settings-tab";

export default class JournalPlugin extends Plugin {
  #stopHandles: WatchStopHandle[] = [];

  async onload(): Promise<void> {
    await this.#loadSettings();
    initCalendarCustomization();

    this.#setupWatchers();

    this.addSettingTab(new JournalSettingTab(this.app, this));
  }
  onunload(): void {
    for (const handle of this.#stopHandles) {
      handle();
    }
  }

  async #loadSettings(): Promise<void> {
    const saved = await this.loadData();
    if (saved) {
      pluginSettings$.value = saved;
    }
  }

  #setupWatchers(): void {
    this.#stopHandles.push(
      watch(
        pluginSettings$,
        debounce((settings) => {
          this.saveData(settings);
        }, 50),
        { deep: true },
      ),
    );
    this.#stopHandles.push(
      watch(
        calendarSettings$,
        () => {
          updateLocale();
        },
        { deep: true, immediate: true },
      ),
    );
  }
}
