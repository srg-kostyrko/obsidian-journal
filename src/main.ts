import { Notice, Plugin, type TFile } from "obsidian";
import { ref, watch, type Ref, type WatchStopHandle } from "vue";
import { debounce } from "perfect-debounce";
import { initCalendarCustomization, restoreLocale, updateLocale } from "./calendar";
import { JournalSettingTab } from "./settings/journal-settings-tab";
import { Journal } from "./journals/journal";
import type { JournalSettings, PluginSettings, ShelfSettings } from "./types/settings.types";
import { defaultJournalSettings, defaultPluginSettings } from "./defaults";
import { prepareJournalDefaultsBasedOnType } from "./journals/journal-defaults";
import { JournalsIndex } from "./journals/journals-index";
import { CALENDAR_VIEW_TYPE } from "./constants";
import { CalendarView } from "./calendar-view/calendar-view";
import { deepCopy } from "./utils/misc";
import { TimelineCodeBlockProcessor } from "./code-blocks/timeline/timeline-processor";
import { NavCodeBlockProcessor } from "./code-blocks/navigation/nav-processor";
import { VueModal } from "./components/modals/vue-modal";
import ConnectNoteModal from "./components/modals/ConnectNote.modal.vue";
import { ShelfSuggestModal } from "./components/suggests/shelf-suggest";
import type { JournalPlugin } from "./types/plugin.types";

export default class JournalPluginImpl extends Plugin implements JournalPlugin {
  #stopHandles: WatchStopHandle[] = [];
  #journals = new Map<string, Journal>();
  #index!: JournalsIndex;
  #activeNote: TFile | null = null;
  #config: Ref<PluginSettings> = ref(deepCopy(defaultPluginSettings));

  get index(): JournalsIndex {
    return this.#index;
  }

  get activeNote(): TFile | null {
    return this.#activeNote;
  }

  get shelves(): ShelfSettings[] {
    return Object.values(this.#config.value.shelves).sort((a, b) => a.name.localeCompare(b.name));
  }

  hasJournal(name: string): boolean {
    return this.#journals.has(name);
  }

  getJournal(name: string): Journal | undefined {
    return this.#journals.get(name);
  }

  createJournal(name: string, write: JournalSettings["write"]): JournalSettings {
    const settings: JournalSettings = deepCopy({
      ...deepCopy(defaultJournalSettings),
      ...prepareJournalDefaultsBasedOnType(write),
      name,
      write,
    });
    this.#config.value.journals[name] = settings;
    this.#journals.set(name, new Journal(name, this, this.app));
    return this.#config.value.journals[name];
  }

  async renameJournal(name: string, newName: string): Promise<void> {
    const journal = this.getJournal(name);
    if (!journal) return;
    await this.#index.renameJournal(name, newName);
    this.#config.value.journals[newName] = this.#config.value.journals[name];
    this.#config.value.journals[newName].name = newName;
    delete this.#config.value.journals[name];
    for (const shelf of this.#config.value.journals[newName].shelves) {
      this.#config.value.shelves[shelf].journals = this.#config.value.shelves[shelf].journals.map((journalName) =>
        journalName === name ? newName : journalName,
      );
    }
    this.#journals.delete(name);
    this.#journals.set(newName, new Journal(newName, this, this.app));
  }

  removeJournal(name: string): void {
    this.#journals.delete(name);
    for (const shelf of this.#config.value.journals[name].shelves) {
      this.#config.value.shelves[shelf].journals = this.#config.value.shelves[shelf].journals.filter(
        (journalName) => journalName !== name,
      );
    }
    delete this.#config.value.journals[name];
  }

  placeCalendarView(moving = false) {
    if (this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).length > 0) {
      if (!moving) return;
      for (const leaf of this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)) {
        leaf.detach();
      }
    }
    if (this.#config.value.calendarView.leaf === "left") {
      this.app.workspace.getLeftLeaf(false)?.setViewState({ type: CALENDAR_VIEW_TYPE }).catch(console.error);
    } else {
      this.app.workspace.getRightLeaf(false)?.setViewState({ type: CALENDAR_VIEW_TYPE }).catch(console.error);
    }
  }

  hasShelf(name: string): boolean {
    return name in this.#config.value.shelves[name];
  }

  createShelf(name: string): void {
    this.#config.value.shelves[name] = {
      name,
      journals: [],
    };
  }

  renameShelf(name: string, newName: string): void {
    this.#config.value.shelves[newName] = this.#config.value.shelves[name];
    delete this.#config.value.shelves[name];
    for (const journal of this.#config.value.shelves[newName].journals) {
      this.#config.value.journals[journal].shelves = this.#config.value.journals[journal].shelves.map((shelf) =>
        shelf === name ? newName : shelf,
      );
    }
  }

  removeShelf(name: string, destinationShelf?: string): void {
    delete this.#config.value.shelves[name];
    for (const journal of this.#config.value.shelves[name].journals) {
      this.#config.value.journals[journal].shelves = destinationShelf
        ? this.#config.value.journals[journal].shelves.map((shelf) => (shelf === name ? destinationShelf : shelf))
        : this.#config.value.journals[journal].shelves.filter((shelf) => shelf !== name);
    }
  }

  async onload(): Promise<void> {
    await this.#loadSettings();
    initCalendarCustomization();
    if (this.#config.value.calendar.firstDayOfWeek === -1) {
      restoreLocale();
    } else {
      updateLocale(this.#config.value.calendar.firstDayOfWeek, this.#config.value.calendar.firstWeekOfYear);
    }

    this.#fillJournals();
    this.#setupWatchers();
    if (this.#config.value.showReloadHint) {
      this.#config.value.showReloadHint = false;
    }

    this.#index = new JournalsIndex(this.app);
    this.addChild(this.#index);
    this.index.reindex();

    this.#configureCommands();

    this.addSettingTab(new JournalSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("calendar-timeline", (source, element, context) => {
      const processor = new TimelineCodeBlockProcessor(this.app, this, element, source, context.sourcePath);
      context.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("calendar-nav", (source, element, context) => {
      const processor = new NavCodeBlockProcessor(this.app, this, element, source, context.sourcePath);
      context.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("interval-nav", (source, element, context) => {
      const processor = new NavCodeBlockProcessor(this.app, this, element, source, context.sourcePath);
      context.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("journal-nav", (source, element, context) => {
      const processor = new NavCodeBlockProcessor(this.app, this, element, source, context.sourcePath);
      context.addChild(processor);
    });

    this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new CalendarView(leaf, this));

    this.app.workspace.onLayoutReady(() => {
      this.placeCalendarView(true);
    });
  }
  onunload(): void {
    for (const handle of this.#stopHandles) {
      handle();
    }
  }

  async #loadSettings(): Promise<void> {
    const saved = await this.loadData();
    if (saved) {
      this.#config.value = saved;
    }
  }

  #fillJournals(): void {
    for (const name of Object.keys(this.#config.value.journals.value)) {
      this.#journals.set(name, new Journal(name, this, this.app));
    }
  }

  #setupWatchers(): void {
    this.#stopHandles.push(
      watch(
        this.#config,
        debounce((settings) => {
          this.saveData(settings).catch(console.error);
        }, 50),
        { deep: true },
      ),
      watch(
        () => this.#config.value.calendarView.leaf,
        () => {
          this.placeCalendarView(true);
        },
      ),
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        this.#activeNote = file;
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
        const nextNote = journal.next(metadata.date, true);
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
        const previousNote = journal.previous(metadata.date, true);
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
      editorCallback: (editor, context) => {
        const file = context.file;
        if (file) {
          new VueModal(this.app, this, "Connect note to a journal", ConnectNoteModal, {
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
        this.app.workspace.revealLeaf(leaf).catch(console.error);
      },
    });

    for (const journal of this.#journals.values()) {
      journal.registerCommands();
    }

    this.addCommand({
      id: "change-calendar-shelf",
      name: "Change calendar view shelf",
      checkCallback: (checking: boolean): boolean => {
        if (checking) {
          return this.#config.value.useShelves && Object.values(this.#config.value.shelves).length > 0;
        }
        new ShelfSuggestModal(this.app, Object.keys(this.#config.value.shelves), (name) => {
          this.#config.value.ui.calendarShelf = name;
        }).open();
        return true;
      },
    });
  }
}
