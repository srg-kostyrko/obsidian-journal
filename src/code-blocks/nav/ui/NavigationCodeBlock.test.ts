import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
