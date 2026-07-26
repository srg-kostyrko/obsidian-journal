import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import type { AnchorString } from "@/calendar";
import { initLocale, m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, Ok, Option } from "@/infrastructure/result";
import {
  CycleService,
  FrontmatterService,
  journalDefaultsFor,
  JournalsIndex,
  JournalsRepository,
  NotePathService,
  NumberingService,
  OpenDateFlow,
} from "@/journals";
import type { JournalConfig, JournalEntry } from "@/journals";
import { customJournal, fakeRepo } from "@/journals/testing";
import { ShelvesRepository } from "@/shelves";
import { TemplateEngine } from "@/templates";

import HomeCodeBlock from "./HomeCodeBlock.vue";

import type { HomeBlockConfig } from "../home-config";

class FakeJournalsRepository {
  #journals: JournalConfig[] = [];
  seed(journals: JournalConfig[]): void {
    this.#journals = journals;
  }
  find() {
    return {
      list: () => this.#journals[Symbol.iterator](),
      ids: () => this.#journals.map((journal) => journal.name)[Symbol.iterator](),
    };
  }
}

class FakeJournalsIndex {
  #entry: JournalEntry | undefined;
  events = createNanoEvents();
  connect(entry: JournalEntry): void {
    this.#entry = entry;
    this.events.emit("entryChanged", { entry, kind: "added" });
  }
  entryByPath() {
    return Option.fromNullable(this.#entry);
  }
}

class FakeShelvesRepository {
  #shelves: { name: string; journals: string[] }[] = [];
  seed(shelves: { name: string; journals: string[] }[]): void {
    this.#shelves = shelves;
  }
  find() {
    return { list: () => this.#shelves[Symbol.iterator]() };
  }
}

class FakeNotePathService {
  pathFor() {
    return new Ok("Custom/today.md" as VaultPath);
  }
}

class FakeFlows {
  calls: { parameters: unknown }[] = [];
  invoke(_flow: unknown, parameters: unknown) {
    this.calls.push({ parameters });
    return AsyncResult.ok({ path: "x" as VaultPath, created: false });
  }
}

function dayJournal(name: string): JournalConfig {
  return journalDefaultsFor({ type: "day" }, name);
}

function weekJournal(name: string): JournalConfig {
  return journalDefaultsFor({ type: "week" }, name);
}

function mount(container: Container, props: { path: VaultPath; config: HomeBlockConfig }) {
  return render(HomeCodeBlock, {
    props,
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
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

describe("HomeCodeBlock", () => {
  beforeAll(() => initLocale("en"));

  let journalsRepo: FakeJournalsRepository;
  let flowsFake: FakeFlows;
  let index: FakeJournalsIndex;
  let shelvesRepo: FakeShelvesRepository;
  let container: Container;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));

    journalsRepo = new FakeJournalsRepository();
    flowsFake = new FakeFlows();
    index = new FakeJournalsIndex();
    shelvesRepo = new FakeShelvesRepository();

    container = new Container();
    container.register(LoggerFactoryToken).useClass(LoggerFactory);
    container.register(JournalsRepository).useValue(journalsRepo as unknown as JournalsRepository);
    container.register(JournalsIndex).useValue(index as unknown as JournalsIndex);
    container.register(ShelvesRepository).useValue(shelvesRepo as unknown as ShelvesRepository);
    container.register(NotePathService).useValue(new FakeNotePathService() as unknown as NotePathService);
    container.register(NoticeService).useValue(new FakeNoticeService());
    container.register(Flows).useValue(flowsFake as unknown as Flows);
    container.register(OpenDateFlow).useValue({} as OpenDateFlow);
  });

  it("renders no links when no journals match the configured entries", () => {
    journalsRepo.seed([]);
    mount(container, { path: "Note.md" as VaultPath, config: { show: ["day"], separator: " • ", scale: 1 } });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("explains itself when no journals match the configured entries", () => {
    journalsRepo.seed([]);
    mount(container, { path: "Note.md" as VaultPath, config: { show: ["day"], separator: " • ", scale: 1 } });
    expect(screen.getByText(m.code_blocks_home_empty())).toBeTruthy();
  });

  it("does not show the empty message when a journal matches", () => {
    journalsRepo.seed([dayJournal("Daily")]);
    mount(container, { path: "Note.md" as VaultPath, config: { show: ["day"], separator: " • ", scale: 1 } });
    expect(screen.queryByText(m.code_blocks_home_empty())).toBeNull();
  });

  it("treats an empty shelf as unset so journals still render", () => {
    // shelf: "" must mean "current shelf" (here none → all journals), not a literal shelf "".
    journalsRepo.seed([dayJournal("Daily")]);
    mount(container, {
      path: "Note.md" as VaultPath,
      config: { show: ["day"], separator: " • ", scale: 1, shelf: "" },
    });
    expect(screen.getByRole("link").textContent).toBe("Today");
  });

  it("renders one link with the relative day label for a matching daily journal", () => {
    journalsRepo.seed([dayJournal("Daily")]);
    mount(container, { path: "Note.md" as VaultPath, config: { show: ["day"], separator: " • ", scale: 1 } });
    expect(screen.getByRole("link").textContent).toBe("Today");
  });

  it("inserts a separator span between items but not before the first", () => {
    journalsRepo.seed([dayJournal("Daily"), weekJournal("Weekly")]);
    mount(container, {
      path: "Note.md" as VaultPath,
      config: { show: ["day", "week"], separator: " | ", scale: 1 },
    });
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    const separators = document.querySelectorAll(".home-code-block__separator");
    expect(separators).toHaveLength(1);
    expect(separators[0]?.textContent).toBe(" | ");
  });

  it("renders the resolved index for a custom journal whose name template uses {{index}}", () => {
    const repo = fakeRepo({
      Sprint: customJournal("Sprint", "week", 1, "2026-05-27", { nameTemplate: "Sprint {{index}}" }),
    });
    const realContainer = new Container();
    realContainer.register(LoggerFactoryToken).useClass(LoggerFactory);
    realContainer.register(JournalsRepository).useValue(repo);
    realContainer.register(JournalsIndex).useClass(JournalsIndex);
    realContainer.register(CycleService).useClass(CycleService);
    realContainer.register(NumberingService).useClass(NumberingService);
    realContainer.register(FrontmatterService).useClass(FrontmatterService);
    realContainer.register(TemplateEngine).useClass(TemplateEngine);
    realContainer.register(NotePathService).useClass(NotePathService);
    realContainer.register(ShelvesRepository).useValue(new FakeShelvesRepository() as unknown as ShelvesRepository);
    realContainer.register(Flows).useValue(flowsFake as unknown as Flows);
    realContainer.register(OpenDateFlow).useValue({} as OpenDateFlow);

    mount(realContainer, { path: "Note.md" as VaultPath, config: { show: ["custom"], separator: " • ", scale: 1 } });

    expect(screen.getByRole("link").textContent).toBe("Sprint 1");
  });

  it("invokes OpenDateFlow with the item's journal names and today's anchor on click", async () => {
    journalsRepo.seed([dayJournal("Daily")]);
    mount(container, { path: "Note.md" as VaultPath, config: { show: ["day"], separator: " • ", scale: 1 } });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("link"));

    expect(flowsFake.calls).toHaveLength(1);
    const parameters = flowsFake.calls[0]?.parameters as { anchor: string; journalNames: string[] };
    expect(parameters.anchor).toBe("2026-05-27");
    expect(parameters.journalNames).toEqual(["Daily"]);
  });

  it("narrows to the host note's shelf when the index registers it after mount", async () => {
    journalsRepo.seed([dayJournal("Daily"), dayJournal("Personal")]);
    shelvesRepo.seed([
      { name: "work", journals: ["Daily"] },
      { name: "home", journals: ["Personal"] },
    ]);
    mount(container, { path: "Note.md" as VaultPath, config: { show: ["day"], separator: " • ", scale: 1 } });

    index.connect({ journalName: "Daily", anchor: "2026-05-27" as AnchorString, path: "Note.md" as VaultPath });
    await nextTick();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("link"));

    const parameters = flowsFake.calls[0]?.parameters as { journalNames: string[] };
    expect(parameters.journalNames).toEqual(["Daily"]);
  });

  it("asks the journal picker to open at the pointer rather than center-screen", async () => {
    journalsRepo.seed([dayJournal("Daily"), dayJournal("Work")]);
    mount(container, { path: "Note.md" as VaultPath, config: { show: ["day"], separator: " • ", scale: 1 } });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getAllByRole("link")[0]);

    const parameters = flowsFake.calls[0]?.parameters as { pickAt?: MouseEvent };
    expect(parameters.pickAt).toBeInstanceOf(MouseEvent);
  });
});
