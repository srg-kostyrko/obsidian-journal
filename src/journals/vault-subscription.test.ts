import { createNanoEvents } from "nanoevents";
import { TFile } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { InternalObsidianAppToken, NoteMetadataService, NotesService, WorkspaceService } from "@/infrastructure/host";
import type { NotesEvents, VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { None, Some } from "@/infrastructure/result";
import { SettingsEventsToken, type SettingsEvents } from "@/settings";

import { CycleService } from "./cycle";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { JournalsRepository, type JournalsEvents } from "./repository";
import { fakeRepo, fixedJournal } from "./testing";
import { JournalsEventsToken } from "./tokens";
import { VaultSubscriptionService } from "./vault-subscription";

function fakeTFile(path: string): TFile {
  const file = Object.create(TFile.prototype) as TFile & { path: string; basename: string; extension: string };
  file.path = path;
  file.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  file.extension = "md";
  return file;
}

interface TestRig {
  container: Container;
  emit: <K extends keyof NotesEvents>(event: K, ...arguments_: Parameters<NotesEvents[K]>) => void;
  emitJournalDeleted: (journalName: string) => void;
  emitSettingsReloaded: () => void;
  setFrontmatter(path: string, fm: Record<string, unknown> | null): void;
  setMarkdownNotes(paths: VaultPath[]): void;
  setResolved(path: string, resolved: boolean): void;
  emitResolved(): void;
}

function buildRig(journals: Parameters<typeof fakeRepo>[0], initialPaths: VaultPath[] = []): TestRig {
  const emitter = createNanoEvents<NotesEvents>();
  let markdownNotes = [...initialPaths];
  const frontmatterByPath = new Map<string, Record<string, unknown>>();
  // metadataCache only exposes a note's cache once Obsidian has parsed it. A note can sit
  // on disk (getAbstractFileByPath finds it) while still unresolved at boot, which is the
  // window the import race lives in. Default to resolved so the existing tests model a
  // settled vault; the boot-race test opts a path back to unresolved.
  const resolvedPaths = new Set<string>();

  const notes = {
    allMarkdownNotes: () => [...markdownNotes],
    events: emitter,
  };

  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => {
        if (frontmatterByPath.has(path) || markdownNotes.includes(path as VaultPath)) {
          return fakeTFile(path);
        }
        return null;
      },
    },
    metadataCache: {
      getFileCache: (file: TFile) => {
        if (!resolvedPaths.has(file.path)) return null;
        return { frontmatter: frontmatterByPath.get(file.path) };
      },
    },
  };

  const resolvedListeners = new Set<() => void>();
  const metadata = {
    get: (path: VaultPath) => (resolvedPaths.has(path) ? new Some({ properties: {} }) : new None()),
    onResolved: (callback: () => void) => {
      resolvedListeners.add(callback);
      return () => resolvedListeners.delete(callback);
    },
  };
  const workspace = {
    onLayoutReady: (callback: () => void) => callback(),
  };

  const fakeLogger = {
    named: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  };

  const settingsEvents = createNanoEvents<SettingsEvents>();
  const journalEvents = createNanoEvents<JournalsEvents>();

  const c = new Container();
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsEventsToken).useValue(journalEvents);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(NotesService).useValue(notes as never);
  c.register(InternalObsidianAppToken).useValue(app as never);
  c.register(NoteMetadataService).useValue(metadata as never);
  c.register(WorkspaceService).useValue(workspace as never);
  c.register(SettingsEventsToken).useValue(settingsEvents);
  c.register(LoggerFactoryToken).useValue(fakeLogger as never);
  c.register(VaultSubscriptionService).useClass(VaultSubscriptionService);

  return {
    container: c,
    emit: (event, ...arguments_) => emitter.emit(event, ...arguments_),
    emitJournalDeleted: (journalName) => journalEvents.emit("deleted", journalName),
    emitSettingsReloaded: () => settingsEvents.emit("reloaded"),
    setFrontmatter: (path, fm) => {
      if (fm === null) {
        frontmatterByPath.delete(path);
        resolvedPaths.delete(path);
      } else {
        frontmatterByPath.set(path, fm);
        resolvedPaths.add(path);
      }
    },
    setMarkdownNotes: (paths) => {
      markdownNotes = [...paths];
    },
    setResolved: (path, resolved) => {
      if (resolved) resolvedPaths.add(path);
      else resolvedPaths.delete(path);
    },
    emitResolved: () => {
      for (const listener of resolvedListeners) listener();
    },
  };
}

describe("VaultSubscriptionService", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("populates JournalsIndex with parseable notes during initialize", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["D/2024-01-01.md" as VaultPath]);
    rig.setFrontmatter("D/2024-01-01.md", { journal: "daily", "journal-date": "2024-01-01" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("D/2024-01-01.md" as VaultPath).isSome()).toBe(true);
  });

  it("indexes an imported note whose metadata resolves only after the boot walk", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["day/2024-01-01.md" as VaultPath]);
    rig.setFrontmatter("day/2024-01-01.md", { journal: "daily", "journal-date": "2024-01-01" });
    // Imported note: on disk at boot, but metadataCache has not parsed it yet.
    rig.setResolved("day/2024-01-01.md", false);
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    rig.setResolved("day/2024-01-01.md", true);
    rig.emitResolved();

    expect(index.entryByPath("day/2024-01-01.md" as VaultPath).isSome()).toBe(true);
  });

  it("registers a newly-parseable note on metadata-changed", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();

    rig.setFrontmatter("D/X.md", { journal: "daily", "journal-date": "2024-01-02" });
    rig.emit("metadata-changed", "D/X.md" as VaultPath);

    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("D/X.md" as VaultPath).isSome()).toBe(true);
  });

  it("unregisters a note when its frontmatter no longer parses", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["D/X.md" as VaultPath]);
    rig.setFrontmatter("D/X.md", { journal: "daily", "journal-date": "2024-01-02" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("D/X.md" as VaultPath).isSome()).toBe(true);

    rig.setFrontmatter("D/X.md", {});
    rig.emit("metadata-changed", "D/X.md" as VaultPath);

    expect(index.entryByPath("D/X.md" as VaultPath).isNone()).toBe(true);
  });

  it("transfers the entry path on rename", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["D/A.md" as VaultPath]);
    rig.setFrontmatter("D/A.md", { journal: "daily", "journal-date": "2024-01-01" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    rig.emit("renamed", { from: "D/A.md" as VaultPath, to: "D/B.md" as VaultPath });

    expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
    expect(index.entryByPath("D/B.md" as VaultPath).isSome()).toBe(true);
  });

  it("unregisters on delete", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["D/A.md" as VaultPath]);
    rig.setFrontmatter("D/A.md", { journal: "daily", "journal-date": "2024-01-01" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    rig.emit("deleted", "D/A.md" as VaultPath);

    expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
  });

  it("clears the index for a deleted journal whose notes keep their frontmatter", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, ["D/A.md" as VaultPath]);
    rig.setFrontmatter("D/A.md", { journal: "daily", "journal-date": "2024-01-01" });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("D/A.md" as VaultPath).isSome()).toBe(true);

    // The "keep" delete mode leaves the note (and its frontmatter) in place, so no vault event
    // fires — only the journal's own "deleted" event can drop its stale index entry.
    rig.emitJournalDeleted("daily");

    expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
  });

  it("reindexes notes when settings are reloaded from an external sync", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();

    rig.setFrontmatter("D/X.md", { journal: "daily", "journal-date": "2024-01-03" });
    rig.setMarkdownNotes(["D/X.md" as VaultPath]);
    rig.emitSettingsReloaded();

    const index = rig.container.resolve(JournalsIndex);
    expect(index.entryByPath("D/X.md" as VaultPath).isSome()).toBe(true);
  });

  it("does not register on created (waits for metadata-changed)", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    rig.emit("created", { path: "D/A.md" as VaultPath, basename: "A", folder: "D" as VaultPath });
    expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
  });
});
