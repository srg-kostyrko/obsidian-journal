import { createNanoEvents } from "nanoevents";
import { TFile } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { InternalObsidianAppToken, NotesService } from "@/infrastructure/host";
import type { NotesEvents, VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { JournalsRepository } from "./repository";
import { fakeRepo, fakeSettings, fixedJournal } from "./testing";
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
  setFrontmatter(path: string, fm: Record<string, unknown> | null): void;
  setMarkdownNotes(paths: VaultPath[]): void;
}

function buildRig(journals: Parameters<typeof fakeRepo>[0], initialPaths: VaultPath[] = []): TestRig {
  const emitter = createNanoEvents<NotesEvents>();
  let markdownNotes = [...initialPaths];
  const frontmatterByPath = new Map<string, Record<string, unknown>>();

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
        const fm = frontmatterByPath.get(file.path);
        return fm ? { frontmatter: fm } : null;
      },
    },
  };

  const fakeLogger = {
    named: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  };

  const c = new Container();
  c.register(SettingsService).useValue(fakeSettings(journals));
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(NotesService).useValue(notes as never);
  c.register(InternalObsidianAppToken).useValue(app as never);
  c.register(LoggerFactoryToken).useValue(fakeLogger as never);
  c.register(VaultSubscriptionService).useClass(VaultSubscriptionService);

  return {
    container: c,
    emit: (event, ...arguments_) => emitter.emit(event, ...arguments_),
    setFrontmatter: (path, fm) => {
      if (fm === null) frontmatterByPath.delete(path);
      else frontmatterByPath.set(path, fm);
    },
    setMarkdownNotes: (paths) => {
      markdownNotes = [...paths];
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

  it("does not register on created (waits for metadata-changed)", async () => {
    const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) });
    const sub = rig.container.resolve(VaultSubscriptionService);
    await sub.initialize();
    const index = rig.container.resolve(JournalsIndex);

    rig.emit("created", { path: "D/A.md" as VaultPath, basename: "A", folder: "D" as VaultPath });
    expect(index.entryByPath("D/A.md" as VaultPath).isNone()).toBe(true);
  });
});
