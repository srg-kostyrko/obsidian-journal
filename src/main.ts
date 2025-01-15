import { Notice, Plugin, type TFile } from "obsidian";
import { ref, shallowRef, watch, type Ref, type WatchStopHandle } from "vue";
import { debounce } from "perfect-debounce";
import { initCalendarCustomization, restoreLocale, today, updateLocale } from "./calendar";
import { JournalSettingTab } from "./settings/journal-settings-tab";
import { Journal } from "./journals/journal";
import type { JournalSettings, NotesProcessing, PluginSettings, ShelfSettings } from "./types/settings.types";
import { defaultJournalSettings, defaultPluginSettings } from "./defaults";
import { prepareJournalDefaultsBasedOnType } from "./journals/journal-defaults";
import { JournalsIndex } from "./journals/journals-index";
import { AUTO_CREATE_INTERVAL, CALENDAR_VIEW_TYPE, FRONTMATTER_DATE_FORMAT } from "./constants";
import { CalendarView } from "./calendar-view/calendar-view";
import { deepCopy } from "./utils/misc";
import { TimelineCodeBlockProcessor } from "./code-blocks/timeline/timeline-processor";
import { NavCodeBlockProcessor } from "./code-blocks/navigation/nav-processor";
import { VueModal } from "./components/modals/vue-modal";
import ConnectNoteModal from "./components/modals/ConnectNote.modal.vue";
import { ShelfSuggestModal } from "./components/suggests/shelf-suggest";
import type { JournalPlugin } from "./types/plugin.types";
import { openDateInJournal } from "./journals/open-date";
import { HomeCodeBlockProcessor } from "./code-blocks/home/home-processor";

export default class JournalPluginImpl extends Plugin implements JournalPlugin {
  #stopHandles: WatchStopHandle[] = [];
  #journals = shallowRef<Record<string, Journal>>({});
  #index!: JournalsIndex;
  #activeNote: Ref<TFile | null> = ref(null);
  #config: Ref<PluginSettings> = ref(deepCopy(defaultPluginSettings));
  #autoCreateTimer: ReturnType<typeof setTimeout> | undefined;

  get showReloadHint(): boolean {
    return this.#config.value.showReloadHint;
  }

  get index(): JournalsIndex {
    return this.#index;
  }

  get activeNote(): TFile | null {
    return this.#activeNote.value;
  }

  get usesShelves() {
    return this.#config.value.useShelves;
  }
  set usesShelves(value: boolean) {
    this.#config.value.useShelves = value;
  }

  get openOnStartup() {
    return this.#config.value.openOnStartup;
  }
  set openOnStartup(value: string) {
    this.#config.value.openOnStartup = value;
  }

  get calendarSettings() {
    return this.#config.value.calendar;
  }
  get calendarViewSettings() {
    return this.#config.value.calendarView;
  }

  get uiSettings() {
    return this.#config.value.ui;
  }

  get shelves(): ShelfSettings[] {
    return Object.values(this.#config.value.shelves).sort((a, b) => a.name.localeCompare(b.name));
  }

  getShelf(name: string): ShelfSettings | undefined {
    return this.#config.value.shelves[name];
  }

  get journals(): Journal[] {
    return Object.values(this.#journals.value);
  }

  hasJournal(name: string): boolean {
    return name in this.#journals.value;
  }

  getJournal(name: string): Journal | undefined {
    return this.#journals.value[name];
  }

  getJournalConfig(name: string): JournalSettings {
    return this.#config.value.journals[name];
  }

  createJournal(name: string, write: JournalSettings["write"]): JournalSettings {
    const settings: JournalSettings = deepCopy({
      ...defaultJournalSettings,
      ...prepareJournalDefaultsBasedOnType(write),
      name,
      write,
    });
    this.#config.value.journals[name] = settings;
    this.#journals.value = {
      ...this.#journals.value,
      [name]: new Journal(name, this),
    };
    this.getJournal(name)?.autoCreate().catch(console.error);
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
    const { [name]: _, ...otherJournals } = this.#journals.value;
    this.#journals.value = {
      ...otherJournals,
      [newName]: new Journal(newName, this),
    };
    if (this.#config.value.openOnStartup === name) {
      this.#config.value.openOnStartup = newName;
    }
  }

  async removeJournal(name: string, notesProcessing: NotesProcessing): Promise<void> {
    const journal = this.getJournal(name);
    if (!journal) return;
    switch (notesProcessing) {
      case "clear": {
        await journal.clearNotes();
        break;
      }
      case "delete": {
        await journal.deleteNotes();
        break;
      }
    }
    const { [name]: _, ...otherJournals } = this.#journals.value;
    this.#journals.value = otherJournals;
    for (const shelf of this.#config.value.journals[name].shelves) {
      this.#config.value.shelves[shelf].journals = this.#config.value.shelves[shelf].journals.filter(
        (journalName) => journalName !== name,
      );
    }
    delete this.#config.value.journals[name];
    if (this.#config.value.openOnStartup === name) {
      this.#config.value.openOnStartup = "";
    }
  }

  moveJournal(journalName: string, destinationShelf: string): void {
    const journal = this.getJournal(journalName);
    if (!journal) return;

    const currentShelf = journal.shelfName;
    if (currentShelf) {
      this.#config.value.shelves[currentShelf].journals = this.#config.value.shelves[currentShelf].journals.filter(
        (name) => name !== journalName,
      );
    }
    if (destinationShelf) {
      this.#config.value.shelves[destinationShelf].journals.push(journalName);
      this.#config.value.journals[journalName].shelves = [destinationShelf];
    } else {
      this.#config.value.journals[journalName].shelves = [];
    }
  }

  requestReloadHint(): void {
    this.#config.value.showReloadHint = true;
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
    return name in this.#config.value.shelves;
  }

  createShelf(name: string): void {
    this.#config.value.shelves[name] = {
      name,
      journals: [],
    };
  }

  renameShelf(name: string, newName: string): void {
    this.#config.value.shelves[newName] = this.#config.value.shelves[name];
    this.#config.value.shelves[newName].name = newName;
    for (const journal of this.#config.value.shelves[newName].journals) {
      this.#config.value.journals[journal].shelves = this.#config.value.journals[journal].shelves.map((shelf) =>
        shelf === name ? newName : shelf,
      );
    }
    delete this.#config.value.shelves[name];
  }

  removeShelf(name: string, destinationShelf?: string): void {
    for (const journal of this.#config.value.shelves[name].journals) {
      this.#config.value.journals[journal].shelves = destinationShelf
        ? this.#config.value.journals[journal].shelves.map((shelf) => (shelf === name ? destinationShelf : shelf))
        : this.#config.value.journals[journal].shelves.filter((shelf) => shelf !== name);
    }
    delete this.#config.value.shelves[name];
  }

  async onload(): Promise<void> {
    const appStartup = !this.app.workspace.layoutReady;
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

    this.#index = new JournalsIndex(this);
    this.addChild(this.#index);

    this.#configureCommands();

    this.addSettingTab(new JournalSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("calendar-timeline", (source, element, context) => {
      const processor = new TimelineCodeBlockProcessor(this, element, source, context.sourcePath);
      context.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("calendar-nav", (source, element, context) => {
      const processor = new NavCodeBlockProcessor(this, element, source, context.sourcePath);
      context.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("interval-nav", (source, element, context) => {
      const processor = new NavCodeBlockProcessor(this, element, source, context.sourcePath);
      context.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("journal-nav", (source, element, context) => {
      const processor = new NavCodeBlockProcessor(this, element, source, context.sourcePath);
      context.addChild(processor);
    });
    this.registerMarkdownCodeBlockProcessor("journals-home", (source, element, context) => {
      const processor = new HomeCodeBlockProcessor(this, element, source, context);
      context.addChild(processor);
    });

    this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new CalendarView(leaf, this));

    this.app.workspace.onLayoutReady(async () => {
      this.index.reindex();
      this.placeCalendarView(true);
      this.#activeNote.value = this.app.workspace.getActiveFile();
      await this.autoCreateNotes();
      if (appStartup) {
        await this.openStartupNote();
      }
    });
  }
  onunload(): void {
    clearTimeout(this.#autoCreateTimer);
    for (const handle of this.#stopHandles) {
      handle();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)) {
      leaf.detach();
    }
  }

  async autoCreateNotes() {
    for (const journal of Object.values(this.#journals.value)) {
      await journal.autoCreate();
    }
    this.#sheduleNextAutoCreate();
  }

  async openStartupNote() {
    const openOnStartup = this.#config.value.openOnStartup;
    if (openOnStartup) {
      const journal = this.getJournal(openOnStartup);
      if (journal) {
        await openDateInJournal(this, today().format(FRONTMATTER_DATE_FORMAT), openOnStartup);
      }
    }
  }

  #sheduleNextAutoCreate() {
    clearTimeout(this.#autoCreateTimer);
    this.#autoCreateTimer = setTimeout(() => {
      this.autoCreateNotes().catch(console.error);
    }, AUTO_CREATE_INTERVAL);
  }

  async #loadSettings(): Promise<void> {
    const saved = await this.loadData();
    if (saved) {
      this.#config.value = saved;
    }
  }

  #fillJournals(): void {
    const journals: Record<string, Journal> = {};
    for (const name of Object.keys(this.#config.value.journals)) {
      journals[name] = new Journal(name, this);
    }
    this.#journals.value = journals;
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
        this.#activeNote.value = file;
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
        const journal = this.getJournal(metadata.journal);
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
        const journal = this.getJournal(metadata.journal);
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
          new VueModal(this, "Connect note to a journal", ConnectNoteModal, {
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

    for (const journal of Object.values(this.#journals.value)) {
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
