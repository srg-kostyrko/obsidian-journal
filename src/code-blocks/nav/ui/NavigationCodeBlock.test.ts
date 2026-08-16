import userEvent from "@testing-library/user-event";
import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { DecorationEngine, decorationsSlice, DecorationsStore } from "@/decorations";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { initLocale, m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  NoteMetadataService,
  NotesService,
  PluginData,
  WorkspaceService,
  type MenuItemSpec,
  type NotesEvents,
  type VaultPath,
  NoticeService,
  WorkspaceOpenError,
} from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoteMetadataService, FakeNoticeService, FakePluginData } from "@/infrastructure/host/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
import { RepositoryQuery } from "@/infrastructure/repository";
import { AsyncResult, Option } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  FrontmatterService,
  NotePathService,
  NumberingService,
  OpenDateFlow,
  TimelineService,
  journalDefaultsFor,
  type JournalConfig,
  type JournalEntry,
  type NavBlockSegment,
} from "@/journals";
import { customJournal, fakeRepo } from "@/journals/testing";
import { SettingsEventsToken, SettingsService, SliceDefinitionToken, type SettingsEvents } from "@/settings";
import { ShelvesRepository, type ShelfConfig } from "@/shelves";
import { TemplateEngine } from "@/templates";

import NavigationCodeBlock from "./NavigationCodeBlock.vue";

installTestCalendar();

class FakeJournalsIndex {
  byPath = new Map<string, JournalEntry>();
  byAnchor = new Map<string, JournalEntry>();
  nextByAnchor = new Map<string, VaultPath>();
  prevByAnchor = new Map<string, VaultPath>();
  events = createNanoEvents();

  entryByPath(path: string) {
    return Option.fromNullable(this.byPath.get(path));
  }
  entryByAnchor(name: string, anchor: string) {
    return Option.fromNullable(this.byAnchor.get(`${name}::${anchor}`));
  }
  pathsAt(names: readonly string[], anchor: string) {
    const paths: VaultPath[] = [];
    for (const name of names) {
      const found = this.entryByAnchor(name, anchor);
      if (found.isSome()) paths.push(found.value.path);
    }
    return paths;
  }
  findNext(name: string, anchor: string) {
    return Option.fromNullable(this.nextByAnchor.get(`${name}::${anchor}`));
  }
  findPrevious(name: string, anchor: string) {
    return Option.fromNullable(this.prevByAnchor.get(`${name}::${anchor}`));
  }
}

class FakeWorkspace {
  openNoteCalls: { path: VaultPath; mode: unknown }[] = [];
  pathsMenuCalls: { paths: readonly VaultPath[]; extraItems: readonly MenuItemSpec[] }[] = [];
  previewFirstPathCalls: { paths: readonly VaultPath[] }[] = [];
  openNote(path: VaultPath, mode?: unknown): AsyncResult<void, WorkspaceOpenError> {
    this.openNoteCalls.push({ path, mode });
    return AsyncResult.ok(undefined);
  }
  openPathsMenu(paths: readonly VaultPath[], _event?: MouseEvent, extraItems: readonly MenuItemSpec[] = []) {
    this.pathsMenuCalls.push({ paths, extraItems });
  }
  previewFirstPath(paths: readonly VaultPath[]) {
    this.previewFirstPathCalls.push({ paths });
  }
}

class FakeFlows {
  calls: { flow: unknown; parameters: unknown }[] = [];
  invoke(flow: unknown, parameters: unknown) {
    this.calls.push({ flow, parameters });
    return AsyncResult.ok({ path: "x" as VaultPath, created: false });
  }
}

class FakeShelves {
  shelves: { name: string; journals: string[]; decorations?: ShelfConfig["decorations"] }[] = [];
  find() {
    const entries = this.shelves.map((shelf) => [shelf.name, shelf] as [string, (typeof this.shelves)[number]]);
    return new RepositoryQuery(entries[Symbol.iterator]());
  }
  // DecorationsStore reads a shelf's decorations through this, so fixtures that omit the
  // field (most of them, since this suite predates calendar decorations) default to none.
  get(name: string) {
    return Option.fromNullable(this.shelves.find((shelf) => shelf.name === name)).map((shelf) => ({
      ...shelf,
      decorations: shelf.decorations ?? [],
    }));
  }
}

interface Harness {
  container: Container;
  journalsRepo: JournalsRepository;
  index: FakeJournalsIndex;
  workspace: FakeWorkspace;
  flows: FakeFlows;
  shelves: FakeShelves;
  notices: FakeNoticeService;
  modals: FakeModalService;
}

function buildHarness(journals: Record<string, JournalConfig>): Harness {
  const container = new Container();
  container.addModule(createLoggerTestingModule().module);
  const journalsRepo = fakeRepo(journals);
  container.register(JournalsRepository).useValue(journalsRepo);
  const index = new FakeJournalsIndex();
  container.register(JournalsIndex).useValue(index as unknown as JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  const shelves = new FakeShelves();
  container.register(ShelvesRepository).useValue(shelves as unknown as ShelvesRepository);
  const workspace = new FakeWorkspace();
  container.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  const flows = new FakeFlows();
  const notices = new FakeNoticeService();
  container.register(NoticeService).useValue(notices);
  container.register(Flows).useValue(flows as unknown as Flows);
  container.register(OpenDateFlow).useValue({} as OpenDateFlow);
  const fakeMetadata = new FakeNoteMetadataService();
  container.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  container.register(NotesService).useValue({ events: createNanoEvents<NotesEvents>() } as unknown as NotesService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(TemplateEngine).useClass(TemplateEngine);
  // The segment scope always opts into calendar decorations now, so DecorationsStore's settings
  // backing must exist even for tests that never save a vault-wide or shelf decoration.
  container.register(PluginData).useValue(new FakePluginData() as unknown as PluginData);
  container.register(SliceDefinitionToken).useValue(decorationsSlice);
  container.register(SettingsEventsToken).useValue(createNanoEvents<SettingsEvents>());
  container.register(SettingsService).useClass(SettingsService);
  container.resolve(SettingsService).getSlice(decorationsSlice).state = { decorations: [] };
  container.register(DecorationsStore).useClass(DecorationsStore);
  return { container, journalsRepo, index, workspace, flows, shelves, notices, modals };
}

function mount(h: Harness, path: string) {
  return render(NavigationCodeBlock, {
    props: { path: path as VaultPath, config: {} },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, h.container);
          },
        },
      ],
    },
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeAll(() => initLocale("en"));

function navSegment(overrides: Partial<NavBlockSegment> = {}): NavBlockSegment {
  return {
    template: "today",
    fontSize: 1,
    bold: false,
    italic: false,
    color: { type: "transparent" },
    background: { type: "transparent" },
    link: "none",
    journal: "",
    linkDate: "",
    addDecorations: false,
    ...overrides,
  };
}

function mountWithLines(
  lines: NavBlockSegment[][],
  extra: Record<string, JournalConfig> = {},
  configure?: (h: Harness) => void,
) {
  const base = journalDefaultsFor({ type: "year" }, "yearly");
  const yearly: JournalConfig = { ...base, navBlock: { ...base.navBlock, lines } };
  const h = buildHarness({ yearly, ...extra });
  const entry = { journalName: "yearly", anchor: "2025-01-01" as AnchorString, path: "Yearly/2025.md" as VaultPath };
  h.index.byPath.set("Yearly/2025.md", entry);
  h.index.byAnchor.set("yearly::2025-01-01", entry);
  configure?.(h);
  mount(h, "Yearly/2025.md");
  return h;
}

function quarterlyWithNote(): Record<string, JournalConfig> {
  return { quarterly: journalDefaultsFor({ type: "quarter" }, "quarterly") };
}

// Shelves must be seeded before mount: FakeShelves is plain, non-reactive data, so
// shelfJournals (a computed) only sees a mutation made ahead of the initial render.
function renderNavWithSegment(overrides: Partial<NavBlockSegment>) {
  return mountWithLines([[navSegment(overrides)]], quarterlyWithNote(), (h) => {
    h.shelves.shelves = [{ name: "main", journals: ["yearly", "quarterly"] }];
  });
}

function seedQuarterlyNote(h: Harness): void {
  h.index.byAnchor.set("quarterly::2025-04-01", {
    journalName: "quarterly",
    anchor: "2025-04-01" as AnchorString,
    path: "Quarterly/2025-Q2.md" as VaultPath,
  });
}

function decoratedJournal(base: JournalConfig): JournalConfig {
  return {
    ...base,
    decorations: [
      buildDecoration({
        conditions: [buildCondition("date")],
        styles: [buildStyle("corner", { placement: "top-left" })],
      }),
    ],
  };
}

function withWholeBlockDecoration(base: JournalConfig): JournalConfig {
  return {
    ...base,
    decorations: [],
    navBlock: { ...base.navBlock, decorateWholeBlock: true, lines: [[navSegment()]] },
  };
}

function withPerRowDecoration(base: JournalConfig): JournalConfig {
  return {
    ...base,
    decorations: [],
    navBlock: { ...base.navBlock, decorateWholeBlock: false, lines: [[navSegment({ addDecorations: true })]] },
  };
}

// Every shipped default's decorated segment is link: "self", so this is the case that must
// keep reaching same-write-type shelf mates — narrowing it to the host alone would silently
// change decoration on every existing config with no change to that config (see
// segment-decoration.ts and CLAUDE.md's "Decorations and nav blocks").
function withDefaultSelfLinkDecoration(base: JournalConfig): JournalConfig {
  return {
    ...base,
    decorations: [],
    navBlock: {
      ...base.navBlock,
      decorateWholeBlock: false,
      lines: [[navSegment({ addDecorations: true, link: "self" })]],
    },
  };
}

describe("NavigationCodeBlock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("renders the not-connected message when the path has no journal entry", () => {
    const h = buildHarness({});
    mount(h, "Random/Note.md");
    expect(screen.getByText("Note is not connected to a journal")).toBeTruthy();
  });

  it("drops the not-connected message once the index registers the note after mount", async () => {
    const daily = journalDefaultsFor({ type: "day" }, "daily");
    const h = buildHarness({ daily });
    mount(h, "Daily/2026-05-27.md");

    const entry: JournalEntry = {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    };
    h.index.byPath.set(entry.path, entry);
    h.index.events.emit("entryChanged", { entry, kind: "added" });
    await nextTick();

    expect(screen.queryByText("Note is not connected to a journal")).toBeNull();
  });
});

describe("NavigationCodeBlock columns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("renders the current journal date in 'create' mode with prev/next periods from CycleService", () => {
    const daily = journalDefaultsFor({ type: "day" }, "daily");
    const h = buildHarness({ daily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const dayNumbers = screen.getAllByText(/^(26|27|28)$/);
    expect(dayNumbers.map((element) => element.textContent).toSorted()).toEqual(["26", "27", "28"]);
  });

  it("renders empty side columns in 'existing' mode when there are no adjacent existing entries", () => {
    const daily: JournalConfig = { ...journalDefaultsFor({ type: "day" }, "daily") };
    daily.navBlock = { ...daily.navBlock, type: "existing" };
    const h = buildHarness({ daily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    expect(screen.queryByText("26")).toBeNull();
    expect(screen.queryByText("28")).toBeNull();
    expect(screen.getByText("27")).toBeTruthy();
  });
});

describe("NavigationCodeBlock segment templates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("renders note_name as the connected note's own name, and as the prospective name where no note exists", () => {
    const daily: JournalConfig = { ...journalDefaultsFor({ type: "day" }, "daily") };
    daily.navBlock = { ...daily.navBlock, lines: [[navSegment({ template: "{{note_name}}" })]] };
    const h = buildHarness({ daily });
    const entry: JournalEntry = {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/Renamed day.md" as VaultPath,
    };
    h.index.byPath.set(entry.path, entry);
    h.index.byAnchor.set("daily::2026-05-27", entry);
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, entry.path);

    expect(screen.getByText("Renamed day")).toBeTruthy();
    expect(screen.getByText("2026-05-26")).toBeTruthy();
    expect(screen.getByText("2026-05-28")).toBeTruthy();
  });
});

describe("NavigationCodeBlock arrows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("invokes OpenDateFlow with the previous anchor and existingOnly=false in 'create' mode", async () => {
    const daily = journalDefaultsFor({ type: "day" }, "daily");
    const h = buildHarness({ daily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /previous/i }));

    expect(h.flows.calls).toHaveLength(1);
    const parameters = h.flows.calls[0]?.parameters as {
      anchor: string;
      journalNames: string[];
      existingOnly?: boolean;
    };
    expect(parameters.anchor).toBe("2026-05-26");
    expect(parameters.journalNames).toEqual(["daily"]);
    expect(parameters.existingOnly).toBe(false);
  });

  it("opens the previous entry in a new tab on a middle-click of the arrow", async () => {
    const daily = journalDefaultsFor({ type: "day" }, "daily");
    const h = buildHarness({ daily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const arrow = screen.getByRole("button", { name: /previous/i });
    await fireEvent(arrow, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));

    expect(h.flows.calls).toHaveLength(1);
    const parameters = h.flows.calls[0]?.parameters as { openMode: string };
    expect(parameters.openMode).toBe("tab");
  });

  it("invokes OpenDateFlow with existingOnly=true in 'existing' mode", async () => {
    const daily: JournalConfig = { ...journalDefaultsFor({ type: "day" }, "daily") };
    daily.navBlock = { ...daily.navBlock, type: "existing" };
    const h = buildHarness({ daily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.index.byPath.set("Daily/2026-05-25.md", {
      journalName: "daily",
      anchor: "2026-05-25" as AnchorString,
      path: "Daily/2026-05-25.md" as VaultPath,
    });
    h.index.prevByAnchor.set("daily::2026-05-27", "Daily/2026-05-25.md" as VaultPath);
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /previous/i }));

    const parameters = h.flows.calls[0]?.parameters as { existingOnly?: boolean };
    expect(parameters.existingOnly).toBe(true);
  });
});

function dailyWithRows(rows: NavBlockSegment[]): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, "daily");
  return { ...base, navBlock: { ...base.navBlock, lines: rows.map((row) => [row]) } };
}

describe("NavigationCodeBlock segment click routing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("opens the current entry via WorkspaceService.openNote on a 'self' segment click", async () => {
    const journal = dailyWithRows([
      {
        template: "today",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "self",
        journal: "",
        linkDate: "",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.index.byAnchor.set("daily::2026-05-27", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("today")[1];
    if (target) await user.click(target);
    expect(h.workspace.openNoteCalls.map((c) => c.path)).toEqual(["Daily/2026-05-27.md"]);
    expect(h.flows.calls).toHaveLength(0);
  });

  it("opens a segment's note directly once the index registers it", async () => {
    // Rows read the index for their own period, which is registered asynchronously — the
    // neighboring period's note lands after the block has already rendered.
    const journal = dailyWithRows([navSegment({ template: "{{date}}", link: "self" })]);
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.index.byAnchor.set("daily::2026-05-27", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const tomorrow: JournalEntry = {
      journalName: "daily",
      anchor: "2026-05-28" as AnchorString,
      path: "Daily/2026-05-28.md" as VaultPath,
    };
    h.index.byAnchor.set("daily::2026-05-28", tomorrow);
    h.index.events.emit("entryChanged", { entry: tomorrow, kind: "added" });
    await nextTick();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("2026-05-28"));

    expect(h.workspace.openNoteCalls.map((c) => c.path)).toEqual(["Daily/2026-05-28.md"]);
  });

  it("notifies when the current entry cannot be opened on a 'self' segment click", async () => {
    const journal = dailyWithRows([
      {
        template: "today",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "self",
        journal: "",
        linkDate: "",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.index.byAnchor.set("daily::2026-05-27", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    vi.spyOn(h.workspace, "openNote").mockReturnValue(
      AsyncResult.err(new WorkspaceOpenError("Daily/2026-05-27.md" as VaultPath, "gone")),
    );
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("today")[1];
    if (target) await user.click(target);
    await vi.waitFor(() => expect(h.notices.messages).toContain(m.common_note_open_error()));
  });

  it("opens the current entry in a new tab on a middle-click of a 'self' segment", async () => {
    const journal = dailyWithRows([
      {
        template: "today",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "self",
        journal: "",
        linkDate: "",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.index.byAnchor.set("daily::2026-05-27", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent(target, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));

    expect(h.workspace.openNoteCalls).toHaveLength(1);
    expect(h.workspace.openNoteCalls[0]?.mode).toBe("tab");
  });

  it("opens the current entry in a split on a ctrl+alt click of a 'self' segment", async () => {
    const journal = dailyWithRows([
      {
        template: "today",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "self",
        journal: "",
        linkDate: "",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.index.byAnchor.set("daily::2026-05-27", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.click(target, { ctrlKey: true, altKey: true });

    expect(h.workspace.openNoteCalls).toHaveLength(1);
    expect(h.workspace.openNoteCalls[0]?.mode).toBe("split");
  });

  it("invokes OpenDateFlow with the segment's journal for link 'journal'", async () => {
    const journal = dailyWithRows([
      {
        template: "go",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "journal",
        journal: "weekly",
        linkDate: "",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({ daily: journal, weekly: journalDefaultsFor({ type: "week" }, "weekly") });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "weekly"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("go")[0];
    if (target) await user.click(target);
    const parameters = h.flows.calls[0]?.parameters as { journalNames: string[] };
    expect(parameters.journalNames).toEqual(["weekly"]);
  });

  it("invokes OpenDateFlow with all matching shelf journals for a period kind link", async () => {
    const journal = dailyWithRows([
      {
        template: "wk",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "week",
        journal: "",
        linkDate: "",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({
      daily: journal,
      weekly1: journalDefaultsFor({ type: "week" }, "weekly1"),
      weekly2: journalDefaultsFor({ type: "week" }, "weekly2"),
    });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "weekly1", "weekly2"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("wk")[0];
    if (target) await user.click(target);
    const parameters = h.flows.calls[0]?.parameters as { journalNames: string[] };
    expect(parameters.journalNames.toSorted()).toEqual(["weekly1", "weekly2"]);
  });

  it("does nothing for a 'none' segment click", async () => {
    const journal = dailyWithRows([
      {
        template: "static",
        fontSize: 1,
        bold: false,
        italic: false,
        color: { type: "transparent" },
        background: { type: "transparent" },
        link: "none",
        journal: "",
        linkDate: "",
        addDecorations: false,
      },
    ]);
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("static")[0];
    if (target) await user.click(target);
    expect(h.workspace.openNoteCalls).toHaveLength(0);
    expect(h.flows.calls).toHaveLength(0);
  });

  it("invokes OpenDateFlow with the shifted date for a segment carrying a linkDate", async () => {
    // yearly is anchored at 2025-01-01; the segment shows and opens Q2, not the plain Q1.
    const h = renderNavWithSegment({ link: "quarter", linkDate: "+1q", template: "{{date+1q:[Q]Q}}" });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("Q2")[1];
    if (target) await user.click(target);

    expect(h.flows.calls).toHaveLength(1);
    expect(h.flows.calls[0]?.flow).toBe(OpenDateFlow);
    const parameters = h.flows.calls[0]?.parameters as { anchor: string; journalNames: string[] };
    expect(parameters.anchor).toBe("2025-04-01");
    expect(parameters.journalNames).toEqual(["quarterly"]);
  });

  it("resolves the shifted date's paths for the context menu", async () => {
    const h = renderNavWithSegment({ link: "quarter", linkDate: "+1q", template: "{{date+1q:[Q]Q}}" });
    seedQuarterlyNote(h);

    const target = screen.getAllByText("Q2")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(h.workspace.pathsMenuCalls).toEqual([{ paths: ["Quarterly/2025-Q2.md"], extraItems: [] }]);
  });

  it("previews the shifted date's note on modifier hover", async () => {
    const h = renderNavWithSegment({ link: "quarter", linkDate: "+1q", template: "{{date+1q:[Q]Q}}" });
    seedQuarterlyNote(h);

    const target = screen.getAllByText("Q2")[1];
    if (target) await fireEvent.pointerEnter(target, { ctrlKey: true });

    expect(h.workspace.previewFirstPathCalls).toEqual([{ paths: ["Quarterly/2025-Q2.md"] }]);
  });
});

describe("NavigationCodeBlock context menu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("resolves the single matching path for openPathsMenu", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        lines: [
          [
            {
              template: "today",
              fontSize: 1,
              bold: false,
              italic: false,
              color: { type: "transparent" },
              background: { type: "transparent" },
              link: "self",
              journal: "",
              linkDate: "",
              addDecorations: false,
            },
          ],
        ],
      },
    };
    const h = buildHarness({ daily: journal });
    const entry = {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    };
    h.index.byPath.set("Daily/2026-05-27.md", entry);
    h.index.byAnchor.set("daily::2026-05-27", entry);
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(h.workspace.pathsMenuCalls).toEqual([{ paths: ["Daily/2026-05-27.md"], extraItems: [] }]);
  });

  it("resolves every matching path for openPathsMenu when there are multiple", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        lines: [
          [
            {
              template: "wk",
              fontSize: 1,
              bold: false,
              italic: false,
              color: { type: "transparent" },
              background: { type: "transparent" },
              link: "week",
              journal: "",
              linkDate: "",
              addDecorations: false,
            },
          ],
        ],
      },
    };
    const h = buildHarness({
      daily: journal,
      weekly1: journalDefaultsFor({ type: "week" }, "weekly1"),
      weekly2: journalDefaultsFor({ type: "week" }, "weekly2"),
    });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.index.byAnchor.set("weekly1::2026-05-27", {
      journalName: "weekly1",
      anchor: "2026-05-27" as AnchorString,
      path: "Weekly1/W22.md" as VaultPath,
    });
    h.index.byAnchor.set("weekly2::2026-05-27", {
      journalName: "weekly2",
      anchor: "2026-05-27" as AnchorString,
      path: "Weekly2/W22.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "weekly1", "weekly2"] }];
    mount(h, "Daily/2026-05-27.md");

    const target = screen.getAllByText("wk")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(h.workspace.pathsMenuCalls).toEqual([{ paths: ["Weekly1/W22.md", "Weekly2/W22.md"], extraItems: [] }]);
  });

  it("contributes the explain item to the context menu of a decorated segment", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      decorations: [
        buildDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
      navBlock: {
        ...base.navBlock,
        lines: [[navSegment({ addDecorations: true })]],
      },
    };
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    mount(h, "Daily/2026-05-27.md");

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(h.workspace.pathsMenuCalls[0]?.extraItems).toHaveLength(1);
  });

  // The per-segment decoration map is scoped to write-type, not to the segment's own addDecorations
  // flag (siblings need it to render their own matches), so the segment itself must filter: a segment
  // that opts out of showing a decoration should not offer to explain one it never renders.
  it("contributes no item to the context menu of a segment that opts out of decorations", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      decorations: [
        buildDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
      navBlock: {
        ...base.navBlock,
        lines: [[navSegment({ addDecorations: false })]],
      },
    };
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    mount(h, "Daily/2026-05-27.md");

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(h.workspace.pathsMenuCalls[0]?.extraItems).toEqual([]);
  });

  it("contributes no item to the context menu of an undecorated segment", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = { ...base, navBlock: { ...base.navBlock, lines: [[navSegment()]] } };
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    mount(h, "Daily/2026-05-27.md");

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(h.workspace.pathsMenuCalls[0]?.extraItems).toEqual([]);
  });

  it("opens an interval entry from a custom journal's segment", async () => {
    const base = customJournal("sprint", "week", 2, "2026-05-25");
    const journal: JournalConfig = {
      ...base,
      decorations: [
        buildDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
      // "existing" mode avoids CycleService entirely for adjacent-period navigation, which the
      // fake index in this suite does not support for custom journals — the fixture is not
      // testing adjacent navigation, only the segment's own context menu.
      navBlock: {
        ...base.navBlock,
        type: "existing",
        lines: [[navSegment({ template: "sprint", addDecorations: true })]],
      },
    };
    const h = buildHarness({ sprint: journal });
    h.index.byPath.set("Sprint/2026-05-25.md", {
      journalName: "sprint",
      anchor: "2026-05-25" as AnchorString,
      path: "Sprint/2026-05-25.md" as VaultPath,
    });
    mount(h, "Sprint/2026-05-25.md");

    // With no previous/next existing entries registered, only the current block renders,
    // so its segment is the sole "sprint" match.
    const target = screen.getAllByText("sprint")[0];
    if (target) await fireEvent.contextMenu(target);

    const items = h.workspace.pathsMenuCalls.at(-1)?.extraItems ?? [];
    items[0]?.onClick();

    expect(h.modals.lastOpen<{ entry: { kind: string; journalName?: string } }, void>().props.entry).toMatchObject({
      kind: "interval",
      journalName: "sprint",
    });
  });
});

describe("NavigationCodeBlock hover preview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("resolves the target path for previewFirstPath when pointer enters a segment", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        lines: [
          [
            {
              template: "today",
              fontSize: 1,
              bold: false,
              italic: false,
              color: { type: "transparent" },
              background: { type: "transparent" },
              link: "self",
              journal: "",
              linkDate: "",
              addDecorations: false,
            },
          ],
        ],
      },
    };
    const h = buildHarness({ daily: journal });
    const entry = {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    };
    h.index.byPath.set("Daily/2026-05-27.md", entry);
    h.index.byAnchor.set("daily::2026-05-27", entry);
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.pointerEnter(target, { ctrlKey: true });

    expect(h.workspace.previewFirstPathCalls).toEqual([{ paths: ["Daily/2026-05-27.md"] }]);
  });
});

describe("NavigationCodeBlock decorations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("wraps individual segment text with CellDecoration when addDecorations is true", () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        decorateWholeBlock: false,
        lines: [
          [
            {
              template: "today",
              fontSize: 1,
              bold: false,
              italic: false,
              color: { type: "transparent" },
              background: { type: "transparent" },
              link: "self",
              journal: "",
              linkDate: "",
              addDecorations: true,
            },
          ],
        ],
      },
    };
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const decorations = document.querySelectorAll("[data-testid='cell-decoration']");
    expect(decorations.length).toBe(3);
  });

  it("applies the journal's own decorations when the journal belongs to no shelf", () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      decorations: [
        buildDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
      navBlock: {
        ...base.navBlock,
        decorateWholeBlock: true,
        lines: [
          [
            {
              template: "today",
              fontSize: 1,
              bold: false,
              italic: false,
              color: { type: "transparent" },
              background: { type: "transparent" },
              link: "none",
              journal: "",
              linkDate: "",
              addDecorations: false,
            },
          ],
        ],
      },
    };
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    mount(h, "Daily/2026-05-27.md");

    expect(document.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });

  it("excludes a same-type shelf mate's decorations from a whole-block decoration", () => {
    const daily = withWholeBlockDecoration(journalDefaultsFor({ type: "day" }, "daily"));
    const other: JournalConfig = {
      ...journalDefaultsFor({ type: "day" }, "other"),
      decorations: [
        buildDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
    };
    const h = buildHarness({ daily, other });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "other"] }];
    mount(h, "Daily/2026-05-27.md");

    expect(document.querySelector(".decoration-corner.top-left")).toBeNull();
  });

  it("includes a same-type shelf mate's decorations in a per-segment decoration", () => {
    const daily = withPerRowDecoration(journalDefaultsFor({ type: "day" }, "daily"));
    const other: JournalConfig = {
      ...journalDefaultsFor({ type: "day" }, "other"),
      decorations: [
        buildDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
    };
    const h = buildHarness({ daily, other });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "other"] }];
    mount(h, "Daily/2026-05-27.md");

    expect(document.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });

  it("includes a same-type shelf mate's decorations in a default link: self segment", () => {
    const daily = withDefaultSelfLinkDecoration(journalDefaultsFor({ type: "day" }, "daily"));
    const workDaily: JournalConfig = {
      ...journalDefaultsFor({ type: "day" }, "work-daily"),
      decorations: [
        buildDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
    };
    const h = buildHarness({ daily, "work-daily": workDaily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "work-daily"] }];
    mount(h, "Daily/2026-05-27.md");

    expect(document.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });

  it("excludes a vault-wide date decoration from a custom journal's segment", () => {
    const base = customJournal("sprint", "week", 2, "2026-05-25");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        type: "existing",
        lines: [[navSegment({ template: "sprint", addDecorations: true })]],
      },
    };
    const h = buildHarness({ sprint: journal });
    h.container.resolve(SettingsService).getSlice(decorationsSlice).state = {
      decorations: [
        buildCalendarDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
    };
    h.index.byPath.set("Sprint/2026-05-25.md", {
      journalName: "sprint",
      anchor: "2026-05-25" as AnchorString,
      path: "Sprint/2026-05-25.md" as VaultPath,
    });
    mount(h, "Sprint/2026-05-25.md");

    expect(document.querySelector(".decoration-corner.top-left")).toBeNull();
  });

  it("wraps the entire column with CellDecoration when decorateWholeBlock is true", () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        decorateWholeBlock: true,
        lines: [
          [
            {
              template: "today",
              fontSize: 1,
              bold: false,
              italic: false,
              color: { type: "transparent" },
              background: { type: "transparent" },
              link: "none",
              journal: "",
              linkDate: "",
              addDecorations: false,
            },
          ],
        ],
      },
    };
    const h = buildHarness({ daily: journal });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily"] }];
    mount(h, "Daily/2026-05-27.md");

    const decorations = document.querySelectorAll("[data-testid='cell-decoration']");
    expect(decorations.length).toBe(3);
  });

  it("decorates a year-link segment from the year journal, not the host daily journal", () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const daily: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        decorateWholeBlock: false,
        lines: [[navSegment({ template: "{{date:YYYY}}", link: "year", addDecorations: true })]],
      },
    };
    const yearly = decoratedJournal(journalDefaultsFor({ type: "year" }, "yearly"));
    const h = buildHarness({ daily, yearly });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "yearly"] }];
    mount(h, "Daily/2026-05-27.md");

    expect(document.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });

  it("leaves a year-link segment undecorated when only the host journal has decorations", () => {
    const base = decoratedJournal(journalDefaultsFor({ type: "day" }, "daily"));
    const daily: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        decorateWholeBlock: false,
        lines: [[navSegment({ template: "{{date:YYYY}}", link: "year", addDecorations: true })]],
      },
    };
    const yearly = journalDefaultsFor({ type: "year" }, "yearly");
    const h = buildHarness({ daily, yearly });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    h.shelves.shelves = [{ name: "main", journals: ["daily", "yearly"] }];
    mount(h, "Daily/2026-05-27.md");

    expect(document.querySelector(".decoration-corner.top-left")).toBeNull();
  });

  it("leaves a segment with no resolvable link target undecorated, even though its host period is already decorated", () => {
    const base = decoratedJournal(journalDefaultsFor({ type: "day" }, "daily"));
    const daily: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        decorateWholeBlock: false,
        lines: [
          [
            navSegment({ template: "self", link: "self", addDecorations: true }),
            navSegment({ template: "orphan", link: "year", addDecorations: true }),
          ],
        ],
      },
    };
    // No year-type journal exists anywhere, so the second segment's link resolves to nothing.
    const h = buildHarness({ daily });
    h.index.byPath.set("Daily/2026-05-27.md", {
      journalName: "daily",
      anchor: "2026-05-27" as AnchorString,
      path: "Daily/2026-05-27.md" as VaultPath,
    });
    mount(h, "Daily/2026-05-27.md");

    const selfSegment = screen.getAllByText("self")[1];
    expect(selfSegment?.closest("[data-testid=cell-decoration]")).not.toBeNull();

    const orphanSegment = screen.getAllByText("orphan")[1];
    expect(orphanSegment?.closest("[data-testid=cell-decoration]")).toBeNull();
  });
});
