import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { Container } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, WorkspaceService } from "@/infrastructure/host";
import type { NoteMetadata, VaultPath } from "@/infrastructure/host";
import { FakeWorkspaceService } from "@/infrastructure/host/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
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
  workspace: FakeWorkspaceService;
  resolveMetadata: () => void;
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

  // metadataCache resolves incrementally; model that by withholding every note's
  // metadata until resolveMetadata() signals the cache has caught up.
  let resolved = false;
  const resolvedListeners: (() => void)[] = [];
  const metadata = {
    get: (path: VaultPath): Option<NoteMetadata> => {
      const fm = notesByPath.get(path);
      if (!resolved || !fm) return new None<NoteMetadata>();
      return new Some<NoteMetadata>({ title: "", tags: [], properties: fm, tasks: [] });
    },
    onResolved: (callback: () => void): (() => void) => {
      resolvedListeners.push(callback);
      return () => {
        const index = resolvedListeners.indexOf(callback);
        if (index !== -1) resolvedListeners.splice(index, 1);
      };
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

  const workspace = new FakeWorkspaceService();

  const container = new Container();
  container.register(SettingsService).useValue(settings);
  container.register(NotesService).useValue(notes);
  container.register(NoteMetadataService).useValue(metadata);
  container.register(CycleService).useValue(cycle);
  container.register(JournalsRepository).useValue(repository);
  container.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  container.addModule(createLoggerTestingModule().module);
  container.register(DataMigrationService).useClass(DataMigrationService);

  const service = container.resolve(DataMigrationService);
  const resolveMetadata = (): void => {
    resolved = true;
    // Drain into a fresh array so a listener disposing itself mid-iteration is safe.
    for (const listener of resolvedListeners.splice(0)) listener();
  };
  return { service, notesByPath, updateCalls, sliceState, workspace, resolveMetadata };
}

// The walk waits for the layout (vault file list complete) and then for metadataCache
// to finish parsing; drive both signals, then drain the fire-and-forget walk's microtasks.
async function migrate(stubs: Pick<Stubs, "service" | "workspace" | "resolveMetadata">): Promise<void> {
  await stubs.service.initialize();
  stubs.workspace.setLayoutReady(true);
  stubs.resolveMetadata();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
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
    const { service, notesByPath, workspace, resolveMetadata } = build({
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

    await migrate({ service, workspace, resolveMetadata });

    expect(notesByPath.get("note.md")).toEqual({
      journal: "My Journal Month",
      "journal-date": "2022-01-01",
    });
  });

  it("moves the interval index into the journal's configured index field", async () => {
    const marker: PendingNoteMigration = { oldJournalId: "int", kind: "interval", name: "Sprints" };
    const sprintsConfig = journalDefaultsFor(
      { type: "custom", every: "week", duration: 2, anchorDate: "2022-02-01" as AnchorString },
      "Sprints",
    );
    sprintsConfig.numbering.sources[0].frontmatterKey = "sprint-number";
    const { service, notesByPath, workspace, resolveMetadata } = build({
      notes: {
        "sprint.md": {
          journal: "int",
          "journal-start-date": "2022-02-01",
          "journal-interval-index": 1,
        },
      },
      markers: [marker],
      configs: { Sprints: sprintsConfig },
      anchors: { Sprints: "2022-02-01" as AnchorString },
    });

    await migrate({ service, workspace, resolveMetadata });

    const result = notesByPath.get("sprint.md");
    expect(result?.["sprint-number"]).toBe(1);
    expect(result).not.toHaveProperty("journal-interval-index");
    expect(result).not.toHaveProperty("journal-index");
  });

  it("strips all journal keys when the anchor cannot be resolved", async () => {
    const marker: PendingNoteMigration = {
      oldJournalId: "cal",
      kind: "calendar",
      sectionToName: { month: "My Journal Month" },
    };
    const { service, notesByPath, workspace, resolveMetadata } = build({
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

    await migrate({ service, workspace, resolveMetadata });

    expect(notesByPath.get("orphan.md")).toEqual({ title: "kept" });
  });

  it("clears the marker slice after running", async () => {
    const marker: PendingNoteMigration = { oldJournalId: "int", kind: "interval", name: "Sprints" };
    const { service, sliceState, workspace, resolveMetadata } = build({
      notes: {},
      markers: [marker],
    });

    await migrate({ service, workspace, resolveMetadata });

    expect(sliceState.current).toEqual([]);
  });

  it("does not touch any note when there are no markers", async () => {
    const { service, updateCalls, workspace, resolveMetadata } = build({
      notes: { "note.md": { journal: "cal" } },
      markers: [],
    });

    await migrate({ service, workspace, resolveMetadata });

    expect(updateCalls).toEqual([]);
  });

  const calendarMarker: PendingNoteMigration = {
    oldJournalId: "cal",
    kind: "calendar",
    sectionToName: { month: "My Journal Month" },
  };

  function deferralStubs(): Stubs {
    return build({
      notes: { "note.md": { journal: "cal", "journal-start-date": "2022-01-01", "journal-section": "month" } },
      markers: [calendarMarker],
      configs: { "My Journal Month": config() },
      anchors: { "My Journal Month": "2022-01-01" as AnchorString },
    });
  }

  it("does not walk before the layout is ready", async () => {
    const { service, sliceState } = deferralStubs();

    await service.initialize();

    expect(sliceState.current).toEqual([calendarMarker]);
  });

  it("defers the walk until every note has resolved in metadataCache", async () => {
    const { service, sliceState, workspace, resolveMetadata } = deferralStubs();

    await service.initialize();
    workspace.setLayoutReady(true);
    expect(sliceState.current).toEqual([calendarMarker]);

    resolveMetadata();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(sliceState.current).toEqual([]);
  });

  it("runs once the layout and metadata are already ready", async () => {
    const marker: PendingNoteMigration = { oldJournalId: "int", kind: "interval", name: "Sprints" };
    const { service, sliceState, workspace, resolveMetadata } = build({
      notes: { "note.md": { journal: "other" } },
      markers: [marker],
    });
    workspace.setLayoutReady(true);
    resolveMetadata();

    await service.initialize();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(sliceState.current).toEqual([]);
  });
});
