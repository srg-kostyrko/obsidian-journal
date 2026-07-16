import { createNanoEvents } from "nanoevents";
import { TFile } from "obsidian";
import { vi } from "vitest";

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
import { fakeRepo } from "./testing";
import { JournalsEventsToken } from "./tokens";
import { VaultSubscriptionService } from "./vault-subscription";

function fakeTFile(path: string): TFile {
  const file = Object.create(TFile.prototype) as TFile & { path: string; basename: string; extension: string };
  file.path = path;
  file.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  file.extension = "md";
  return file;
}

export interface TestRig {
  container: Container;
  emit: <K extends keyof NotesEvents>(event: K, ...arguments_: Parameters<NotesEvents[K]>) => void;
  emitJournalDeleted: (journalName: string) => void;
  emitSettingsReloaded: () => void;
  setFrontmatter(path: string, fm: Record<string, unknown> | null): void;
  setMarkdownNotes(paths: VaultPath[]): void;
  setResolved(path: string, resolved: boolean): void;
  emitResolved(): void;
}

export function buildRig(journals: Parameters<typeof fakeRepo>[0], initialPaths: VaultPath[] = []): TestRig {
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
