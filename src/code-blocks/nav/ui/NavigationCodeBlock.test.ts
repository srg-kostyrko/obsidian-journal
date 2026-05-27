import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { DecorationEngine } from "@/decorations";
import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  NoteMetadataService,
  NotesService,
  WorkspaceService,
  type NotesEvents,
  type VaultPath,
} from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, Option } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  OpenDateFlow,
  journalDefaultsFor,
  type JournalConfig,
  type JournalEntry,
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
  findNext(name: string, anchor: string) {
    return Option.fromNullable(this.nextByAnchor.get(`${name}::${anchor}`));
  }
  findPrevious(name: string, anchor: string) {
    return Option.fromNullable(this.prevByAnchor.get(`${name}::${anchor}`));
  }
}

class FakeWorkspace {
  openNoteCalls: { path: VaultPath; mode: unknown }[] = [];
  hoverCalls: { path: VaultPath }[] = [];
  fileMenuCalls: { path: VaultPath }[] = [];
  openNote(path: VaultPath, mode?: unknown) {
    this.openNoteCalls.push({ path, mode });
    return AsyncResult.ok(undefined);
  }
  triggerHoverPreview(path: VaultPath) {
    this.hoverCalls.push({ path });
  }
  openFileMenu(path: VaultPath) {
    this.fileMenuCalls.push({ path });
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
    return { list: () => this.shelves[Symbol.iterator]() };
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
  const shelves = new FakeShelves();
  container.register(ShelvesRepository).useValue(shelves as unknown as ShelvesRepository);
  const workspace = new FakeWorkspace();
  container.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  const flows = new FakeFlows();
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
