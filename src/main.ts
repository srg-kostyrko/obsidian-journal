import { type App, Notice, Plugin } from "obsidian";
import { calendarViewSettings$, journals$, pluginSettings$ } from "./stores/settings.store";
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
import { CalendarView } from "./calendar-view/calendar-view";
import { deepCopy } from "./utils/misc";
import { TimelineCodeBlockProcessor } from "./code-blocks/timeline/timeline-processor";
import { NavCodeBlockProcessor } from "./code-blocks/navigation/nav-processor";
import { VueModal } from "./components/modals/vue-modal";
import ConnectNoteModal from "./components/modals/ConnectNote.modal.vue";

export default class JournalPlugin extends Plugin {
  #stopHandles: WatchStopHandle[] = [];
  #journals = new Map<string, Journal>();
  #index!: JournalsIndex;

  get index(): JournalsIndex {
    return this.#index;
  }

  getJournal(name: string): Journal | undefined {
    return this.#journals.get(name);
  }

  createJournal(name: string, write: JournalSettings["write"]): void {
    const settings: JournalSettings = deepCopy({
      ...deepCopy(defaultJournalSettings),
      ...prepareJournalDefaultsBasedOnType(write),
      name,
      write,
    });
    pluginSettings$.value.journals[name] = settings;
    this.#journals.set(name, new Journal(name));
  }

  async renameJournal(name: string, newName: string): Promise<void> {
    const journal = this.getJournal(name);
    if (!journal) return;
    await this.#index.renameJournal(name, newName);
    pluginSettings$.value.journals[newName] = pluginSettings$.value.journals[name];
    pluginSettings$.value.journals[newName].name = newName;
    delete pluginSettings$.value.journals[name];
    this.#journals.delete(name);
    this.#journals.set(newName, new Journal(newName));
  }

  removeJournal(name: string): void {
    this.#journals.delete(name);
    delete pluginSettings$.value.journals[name];
  }

  placeCalendarView(moving = false) {
    if (this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).length > 0) {
      if (!moving) return;
      for (const leaf of this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)) {
        leaf.detach();
      }
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
    if (pluginSettings$.value.calendar.firstDayOfWeek !== -1) {
      updateLocale(pluginSettings$.value.calendar.firstDayOfWeek, pluginSettings$.value.calendar.firstWeekOfYear);
    }

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
    this.registerMarkdownCodeBlockProcessor("calendar-timeline", (source, element, context) => {
      const processor = new TimelineCodeBlockProcessor(element, source, context.sourcePath);
      context.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("calendar-nav", (source, element, context) => {
      const processor = new NavCodeBlockProcessor(element, source, context.sourcePath);
      context.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("interval-nav", (source, element, context) => {
      const processor = new NavCodeBlockProcessor(element, source, context.sourcePath);
      context.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("journal-nav", (source, element, context) => {
      const processor = new NavCodeBlockProcessor(element, source, context.sourcePath);
      context.addChild(processor);
    });

    this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new CalendarView(leaf));

    this.app.workspace.onLayoutReady(async () => {
      this.placeCalendarView(true);
    });
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
    for (const name of Object.keys(journals$.value)) {
      this.#journals.set(name, new Journal(name));
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
      watch(
        () => calendarViewSettings$.value.leaf,
        () => {
          this.placeCalendarView(true);
        },
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
      editorCallback: async (editor, context) => {
        const file = context.file;
        if (!file) return;
        const metadata = this.#index.getForPath(file.path);
        if (!metadata) {
          new Notice("This note is not connected to any journal.");
          return;
        }
        const journal = this.#journals.get(metadata.journal);
        if (!journal) {
          new Notice("Unknown journal.");
          return;
        }
        const nextNote = await journal.next(metadata.date, true);
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
      editorCallback: async (editor, context) => {
        const file = context.file;
        if (!file) return;
        const metadata = this.#index.getForPath(file.path);
        if (!metadata) {
          new Notice("This note is not connected to any journal.");
          return;
        }
        const journal = this.#journals.get(metadata.journal);
        if (!journal) {
          new Notice("Unknown journal.");
          return;
        }
        const previousNote = await journal.previous(metadata.date, true);
        if (!previousNote) {
          new Notice("There is no previous note before this one.");
          return;
        }
        await journal.open(previousNote);
      },
    });

    this.addCommand({
      id: "connect-note",
      name: "Connect note to a journal",
      editorCallback: async (editor, context) => {
        const file = context.file;
        if (file) {
          new VueModal("Connect note to a journal", ConnectNoteModal, {
            file,
          }).open();
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
