import userEvent from "@testing-library/user-event";
import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { DecorationEngine } from "@/decorations";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  NoteMetadataService,
  NotesService,
  WorkspaceService,
  type NotesEvents,
  type VaultPath,
  NoticeService,
} from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNoticeService } from "@/infrastructure/host/testing";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { RepositoryQuery } from "@/infrastructure/repository";
import { AsyncResult, Option } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  NumberingService,
  OpenDateFlow,
  TimelineService,
  journalDefaultsFor,
  type JournalConfig,
  type JournalEntry,
  type NavBlockRow,
} from "@/journals";
import { fakeRepo } from "@/journals/testing";
import { ShelvesRepository } from "@/shelves";
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
  pathsMenuCalls: { paths: readonly VaultPath[] }[] = [];
  previewFirstPathCalls: { paths: readonly VaultPath[] }[] = [];
  openNote(path: VaultPath, mode?: unknown) {
    this.openNoteCalls.push({ path, mode });
    return AsyncResult.ok(undefined);
  }
  openPathsMenu(paths: readonly VaultPath[]) {
    this.pathsMenuCalls.push({ paths });
  }
  previewFirstPath(paths: readonly VaultPath[]) {
    this.previewFirstPathCalls.push({ paths });
  }
}

class FakeFlows {
  calls: { parameters: unknown }[] = [];
  invoke(_flow: unknown, parameters: unknown) {
    this.calls.push({ parameters });
    return AsyncResult.ok({ path: "x" as VaultPath, created: false });
  }
}

class FakeShelves {
  shelves: { name: string; journals: string[] }[] = [];
  find() {
    const entries = this.shelves.map((shelf) => [shelf.name, shelf] as [string, (typeof this.shelves)[number]]);
    return new RepositoryQuery(entries[Symbol.iterator]());
  }
}

interface Harness {
  container: Container;
  journalsRepo: JournalsRepository;
  index: FakeJournalsIndex;
  workspace: FakeWorkspace;
  flows: FakeFlows;
  shelves: FakeShelves;
}

function buildHarness(journals: Record<string, JournalConfig>): Harness {
  const container = new Container();
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  const journalsRepo = fakeRepo(journals);
  container.register(JournalsRepository).useValue(journalsRepo);
  const index = new FakeJournalsIndex();
  container.register(JournalsIndex).useValue(index as unknown as JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
  container.register(NumberingService).useClass(NumberingService);
  const shelves = new FakeShelves();
  container.register(ShelvesRepository).useValue(shelves as unknown as ShelvesRepository);
  const workspace = new FakeWorkspace();
  container.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  const flows = new FakeFlows();
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useValue(flows as unknown as Flows);
  container.register(OpenDateFlow).useValue({} as OpenDateFlow);
  const fakeMetadata = new FakeNoteMetadataService();
  container.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  container.register(NotesService).useValue({ events: createNanoEvents<NotesEvents>() } as unknown as NotesService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(TemplateEngine).useClass(TemplateEngine);
  return { container, journalsRepo, index, workspace, flows, shelves };
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

function navRow(overrides: Partial<NavBlockRow> = {}): NavBlockRow {
  return {
    template: "today",
    fontSize: 1,
    bold: false,
    italic: false,
    color: { type: "transparent" },
    background: { type: "transparent" },
    link: "none",
    journal: "",
    addDecorations: false,
    ...overrides,
  };
}

function withWholeBlockDecoration(base: JournalConfig): JournalConfig {
  return { ...base, decorations: [], navBlock: { ...base.navBlock, decorateWholeBlock: true, rows: [navRow()] } };
}

function withPerRowDecoration(base: JournalConfig): JournalConfig {
  return {
    ...base,
    decorations: [],
    navBlock: { ...base.navBlock, decorateWholeBlock: false, rows: [navRow({ addDecorations: true })] },
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

function dailyWithRows(rows: JournalConfig["navBlock"]["rows"]): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, "daily");
  return { ...base, navBlock: { ...base.navBlock, rows } };
}

describe("NavigationCodeBlock row click routing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("opens the current entry via WorkspaceService.openNote on a 'self' row click", async () => {
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

  it("opens the current entry in a new tab on a middle-click of a 'self' row", async () => {
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

  it("opens the current entry in a split on a ctrl+alt click of a 'self' row", async () => {
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

  it("invokes OpenDateFlow with the row's journal for link 'journal'", async () => {
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

  it("does nothing for a 'none' row click", async () => {
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
        rows: [
          {
            template: "today",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "self",
            journal: "",
            addDecorations: false,
          },
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

    expect(h.workspace.pathsMenuCalls).toEqual([{ paths: ["Daily/2026-05-27.md"] }]);
  });

  it("resolves every matching path for openPathsMenu when there are multiple", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        rows: [
          {
            template: "wk",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "week",
            journal: "",
            addDecorations: false,
          },
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

    expect(h.workspace.pathsMenuCalls).toEqual([{ paths: ["Weekly1/W22.md", "Weekly2/W22.md"] }]);
  });
});

describe("NavigationCodeBlock hover preview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
  });

  it("resolves the target path for previewFirstPath when pointer enters a row", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        rows: [
          {
            template: "today",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "self",
            journal: "",
            addDecorations: false,
          },
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

  it("wraps individual row text with CellDecoration when addDecorations is true", () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        decorateWholeBlock: false,
        rows: [
          {
            template: "today",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "self",
            journal: "",
            addDecorations: true,
          },
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
        rows: [
          {
            template: "today",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "none",
            journal: "",
            addDecorations: false,
          },
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

  it("includes a same-type shelf mate's decorations in a per-row decoration", () => {
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

  it("wraps the entire column with CellDecoration when decorateWholeBlock is true", () => {
    const base = journalDefaultsFor({ type: "day" }, "daily");
    const journal: JournalConfig = {
      ...base,
      navBlock: {
        ...base.navBlock,
        decorateWholeBlock: true,
        rows: [
          {
            template: "today",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "transparent" },
            background: { type: "transparent" },
            link: "none",
            journal: "",
            addDecorations: false,
          },
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
});
