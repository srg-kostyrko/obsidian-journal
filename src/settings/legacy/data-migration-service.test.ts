import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { Container } from "@/infrastructure/di";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { NoteMetadata, VaultPath } from "@/infrastructure/host";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, None, Option, Some } from "@/infrastructure/result";
import { CycleService, JournalsRepository } from "@/journals";
import { journalDefaultsFor, type JournalConfig } from "@/journals/config";
import { SettingsService } from "@/settings";

import { DataMigrationService } from "./data-migration-service";

import type { PendingNoteMigration } from "./pending-note-migration";

interface Stubs {
  service: DataMigrationService;
  notesByPath: Map<string, Record<string, unknown>>;
  updateCalls: VaultPath[];
  sliceState: { current: PendingNoteMigration[] };
}

interface BuildOptions {
  notes: Record<string, Record<string, unknown>>;
  markers: PendingNoteMigration[];
  configs?: Record<string, JournalConfig>;
  anchors?: Record<string, AnchorString | null>;
}

function build(options: BuildOptions): Stubs {
  const notesByPath = new Map<string, Record<string, unknown>>(
    Object.entries(options.notes).map(([path, fm]) => [path, { ...fm }]),
  );
  const updateCalls: VaultPath[] = [];
  const sliceState = { current: options.markers };

  const settings = {
    getSlice: () => ({
      get state() {
        return sliceState.current;
      },
      set state(value: PendingNoteMigration[]) {
        sliceState.current = value;
      },
    }),
  } as unknown as SettingsService;

  const notes = {
    allMarkdownNotes: (): VaultPath[] => [...notesByPath.keys()] as VaultPath[],
    updateFrontmatter: (path: VaultPath, mutate: (fm: Record<string, unknown>) => void) => {
      updateCalls.push(path);
      const fm = notesByPath.get(path);
      if (fm) mutate(fm);
      return AsyncResult.ok();
    },
  } as unknown as NotesService;

  const metadata = {
    get: (path: VaultPath): Option<NoteMetadata> => {
      const fm = notesByPath.get(path);
      if (!fm) return new None<NoteMetadata>();
      return new Some<NoteMetadata>({ title: "", tags: [], properties: fm, tasks: [] });
    },
  } as unknown as NoteMetadataService;

  const cycle = {
    anchorOf: (name: string): Option<AnchorString> => {
      const anchor = options.anchors?.[name];
      return anchor === undefined || anchor === null ? new None<AnchorString>() : new Some<AnchorString>(anchor);
    },
  } as unknown as CycleService;

  const repository = {
    get: (name: string): Option<JournalConfig> => Option.fromNullable(options.configs?.[name]),
  } as unknown as JournalsRepository;

  const container = new Container();
  container.register(SettingsService).useValue(settings);
  container.register(NotesService).useValue(notes);
  container.register(NoteMetadataService).useValue(metadata);
  container.register(CycleService).useValue(cycle);
  container.register(JournalsRepository).useValue(repository);
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  container.register(DataMigrationService).useClass(DataMigrationService);

  const service = container.resolve(DataMigrationService);
  return { service, notesByPath, updateCalls, sliceState };
}

function config(overrides: Partial<JournalConfig["frontmatter"]> = {}): JournalConfig {
  const base = journalDefaultsFor({ type: "month" }, "irrelevant");
  return { ...base, frontmatter: { ...base.frontmatter, ...overrides } };
}

describe("DataMigrationService", () => {
  it("renames a calendar note to the resolved journal and writes the date field", async () => {
    const marker: PendingNoteMigration = {
      oldJournalId: "cal",
      kind: "calendar",
      sectionToName: { month: "My Journal Month" },
    };
    const { service, notesByPath } = build({
      notes: {
        "note.md": {
          journal: "cal",
          "journal-start-date": "2022-01-01",
          "journal-end-date": "2022-01-31",
          "journal-section": "month",
        },
      },
      markers: [marker],
      configs: { "My Journal Month": config({ addStartDate: false, addEndDate: false }) },
      anchors: { "My Journal Month": "2022-01-01" as AnchorString },
    });

    await service.initialize();

    expect(notesByPath.get("note.md")).toEqual({
      journal: "My Journal Month",
      "journal-date": "2022-01-01",
    });
  });

  it("moves the interval index into the journal's configured index field", async () => {
    const marker: PendingNoteMigration = { oldJournalId: "int", kind: "interval", name: "Sprints" };
    const { service, notesByPath } = build({
      notes: {
        "sprint.md": {
          journal: "int",
          "journal-start-date": "2022-01-01",
          "journal-interval-index": 1,
        },
      },
      markers: [marker],
      configs: { Sprints: config() },
      anchors: { Sprints: "2022-01-01" as AnchorString },
    });

    await service.initialize();

    const result = notesByPath.get("sprint.md");
    expect(result?.["journal-index"]).toBe(1);
    expect(result).not.toHaveProperty("journal-interval-index");
  });

  it("strips all journal keys when the anchor cannot be resolved", async () => {
    const marker: PendingNoteMigration = {
      oldJournalId: "cal",
      kind: "calendar",
      sectionToName: { month: "My Journal Month" },
    };
    const { service, notesByPath } = build({
      notes: {
        "orphan.md": {
          journal: "cal",
          "journal-start-date": "2022-01-01",
          "journal-end-date": "2022-01-31",
          "journal-section": "month",
          "journal-date": "2022-01-01",
          title: "kept",
        },
      },
      markers: [marker],
      configs: { "My Journal Month": config() },
      anchors: { "My Journal Month": null },
    });

    await service.initialize();

    expect(notesByPath.get("orphan.md")).toEqual({ title: "kept" });
  });

  it("clears the marker slice after running", async () => {
    const marker: PendingNoteMigration = { oldJournalId: "int", kind: "interval", name: "Sprints" };
    const { service, sliceState } = build({
      notes: {},
      markers: [marker],
    });

    await service.initialize();

    expect(sliceState.current).toEqual([]);
  });

  it("does not touch any note when there are no markers", async () => {
    const { service, updateCalls } = build({
      notes: { "note.md": { journal: "cal" } },
      markers: [],
    });

    await service.initialize();

    expect(updateCalls).toEqual([]);
  });
});
