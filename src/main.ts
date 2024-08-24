import { type App, Notice, Plugin } from "obsidian";
import { calendarSettings$, calendarViewSettings$, journals$, pluginSettings$ } from "./stores/settings.store";
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
import { CALENDAR_VIEW_TYPE } from "./constants";

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

  placeCalendarView(moving = false) {
    if (this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).length > 0) {
      if (!moving) return;
      this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).forEach((leaf) => {
        leaf.detach();
      });
    }
    if (calendarViewSettings$.value.leaf === "left") {
      this.app.workspace.getLeftLeaf(false)?.setViewState({ type: CALENDAR_VIEW_TYPE });
    } else {
      this.app.workspace.getRightLeaf(false)?.setViewState({ type: CALENDAR_VIEW_TYPE });
    }
  }

  async onload(): Promise<void> {
    app$.value = this.app;
    plugin$.value = this;

    await this.#loadSettings();
    initCalendarCustomization();

    this.#fillJournals();
    this.#setupWatchers();
    if (pluginSettings$.value.showReloadHint) {
      pluginSettings$.value.showReloadHint = false;
    }

    this.#index = new JournalsIndex();
    this.addChild(this.#index);
    this.index.reindex();

    this.#configureCommands();

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

  #configureCommands(): void {
    this.addCommand({
      id: "open-next",
      name: "Open next note",
      editorCallback: async (editor, ctx) => {
        const file = ctx.file;
        if (!file) return;
        const metadata = this.#index.getForPath(file.path);
        if (!metadata) {
          new Notice("This note is not connected to any journal.");
          return;
        }
        const journal = this.#journals.get(metadata.id);
        if (!journal) {
          new Notice("Unknown journal id.");
          return;
        }
        const nextNote = await journal.next(metadata, true);
        if (!nextNote) {
          new Notice("There is no next note after this one.");
          return;
        }
        await journal.open(nextNote);
      },
    });
    this.addCommand({
      id: "open-prev",
      name: "Open previous note",
      editorCallback: async (editor, ctx) => {
        const file = ctx.file;
        if (!file) return;
        const metadata = this.#index.getForPath(file.path);
        if (!metadata) {
          new Notice("This note is not connected to any journal.");
          return;
        }
        const journal = this.#journals.get(metadata.id);
        if (!journal) {
          new Notice("Unknown journal id.");
          return;
        }
        const prevNote = await journal.previous(metadata, true);
        if (!prevNote) {
          new Notice("There is no previous note before this one.");
          return;
        }
        await journal.open(prevNote);
      },
    });

    this.addCommand({
      id: "connect-note",
      name: "Connect note to a journal",
      editorCallback: async (editor, ctx) => {
        const file = ctx.file;
        if (file) {
          // TODO
          // new ConnectNoteModal(this.app, this, file).open();
        }
      },
    });

    this.addCommand({
      id: "open-calendar",
      name: "Open calendar",
      callback: () => {
        let [leaf] = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE);
        if (!leaf) {
          this.placeCalendarView();
          leaf = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0];
        }
        this.app.workspace.revealLeaf(leaf);
      },
    });

    for (const journal of this.#journals.values()) {
      journal.registerCommands();
    }
  }
}
