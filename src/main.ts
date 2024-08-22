import { type App, Plugin } from "obsidian";
import { calendarSettings$, journals$, pluginSettings$ } from "./stores/settings.store";
import { watch, type WatchStopHandle } from "vue";
import { debounce } from "perfect-debounce";
import { initCalendarCustomization, updateLocale } from "./calendar";
import { JournalSettingTab } from "./settings/journal-settings-tab";
import { activeNote$, app$, plugin$ } from "./stores/obsidian.store";
import { Journal } from "./journals/journal";
import type { JournalSettings } from "./types/settings.types";
import { defaultJournalSettings } from "./defaults";
import { prepareJournalDefaultsBasedOnType } from "./journals/journal-defaults";
import { JournalsIndex } from "./journals/journals-index";

export default class JournalPlugin extends Plugin {
  #stopHandles: WatchStopHandle[] = [];
  #journals = new Map<string, Journal>();
  #index!: JournalsIndex;

  get index(): JournalsIndex {
    return this.#index;
  }

  createJournal(id: string, name: string, write: JournalSettings["write"]): void {
    const settings: JournalSettings = {
      ...structuredClone(defaultJournalSettings),
      ...prepareJournalDefaultsBasedOnType(write),
      id,
      name,
      write,
    };
    pluginSettings$.value.journals[id] = settings;
    this.#journals.set(id, new Journal(id));
  }

  removeJournal(id: string): void {
    this.#journals.delete(id);
    delete pluginSettings$.value.journals[id];
  }

  async onload(): Promise<void> {
    app$.value = this.app;
    plugin$.value = this;

    await this.#loadSettings();
    initCalendarCustomization();

    this.#fillJournals();
    this.#setupWatchers();
    this.#index = new JournalsIndex();
    this.addChild(this.#index);
    this.index.reindex();

    this.addSettingTab(new JournalSettingTab(this.app, this));
  }
  onunload(): void {
    for (const handle of this.#stopHandles) {
      handle();
    }
    app$.value = {} as App;
  }

  async #loadSettings(): Promise<void> {
    const saved = await this.loadData();
    if (saved) {
      pluginSettings$.value = saved;
    }
  }

  #fillJournals(): void {
    for (const id of Object.keys(journals$.value)) {
      this.#journals.set(id, new Journal(id));
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

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        activeNote$.value = file;
      }),
    );
  }
}
