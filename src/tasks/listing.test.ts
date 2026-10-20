import { describe, expect, it, vi } from "vitest";

import { CalendarDate, type AnchorString } from "@/calendar";
import {
  NoteMetadataService,
  NoteStructureService,
  NotesService,
  type NoteStructure,
  type VaultPath,
} from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNoteStructureService, FakeNotesService } from "@/infrastructure/host/testing";
import { Option } from "@/infrastructure/result";
import { JournalsIndex, type JournalConfig, type NoteletEntry } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { overrideWith, testContainer } from "@/testing";

import { buildTaskListing, type TaskListingDependencies, type TaskListingPeriodRequest } from "./listing";
import { tasksCoreModule } from "./module";
import { CHECKBOX_PROVIDER_ID } from "./providers/checkbox/extract";
import { NotePropertyTaskProvider } from "./providers/note-property/provider";
import { NOTE_PROPERTY_PROVIDER_ID } from "./providers/note-property/slice";
import { DEFAULT_TASK_QUERY } from "./query";
import { TaskIndex } from "./task-index";
import { buildTaskItem } from "./testing";
import { TaskProviderToken } from "./types";
import { TaskVisibility } from "./visibility";

import type { TaskRule } from "./conditions";
import type { TaskQuery } from "./query";
import type { TaskItem } from "./types";
import type { VisibilityRule } from "./visibility-rule/rule";

const DAY = "Daily/2026-09-22.md" as VaultPath;
const OTHER_DAY = "Daily/2026-09-23.md" as VaultPath;
const MONTH = "Monthly/2026-09.md" as VaultPath;
const NOTELET = "Daily/2026-09-22 Standup.md" as VaultPath;
const WEEK = "Weekly/2026-W36.md" as VaultPath;
const SPRINT = "Sprints/2026-08-25.md" as VaultPath;
const LATER_SPRINT = "Sprints/2026-09-05.md" as VaultPath;
const CLOSED_SPRINT_NOTELET = "Sprints/2026-08-29 Retro.md" as VaultPath;
const LATER_SPRINT_NOTELET = "Sprints/2026-09-05 Retro.md" as VaultPath;

const EMPTY_STRUCTURE: NoteStructure = { listItems: [], tags: [], headings: [], frontmatterTags: [] };

function line(path: VaultPath, lineNumber: number, overrides: Partial<TaskItem> = {}): TaskItem {
  return buildTaskItem({
    path,
    key: `${path}:${lineNumber}`,
    display: { kind: "line", path, line: lineNumber, endLine: lineNumber, parentLine: null, markdown: null },
    ...overrides,
  });
}

function child(path: VaultPath, lineNumber: number, parentLine: number, overrides: Partial<TaskItem> = {}): TaskItem {
  return buildTaskItem({
    path,
    key: `${path}:${lineNumber}`,
    display: { kind: "line", path, line: lineNumber, endLine: lineNumber, parentLine, markdown: null },
    ...overrides,
  });
}

// Keyed by plain string, not AnchorString: a branded key type rejects the anchor literals these
// fixtures are readable with.
type AnchorMap = Partial<Record<string, Record<string, VaultPath>>>;
type EndMap = Partial<Record<string, Record<string, string>>>;
type NoteletMap = Partial<Record<string, Record<string, readonly VaultPath[]>>>;

function noteletEntry(journalName: string, anchor: AnchorString, path: VaultPath): NoteletEntry {
  return { kind: "notelet", journalName, anchor, path, typeName: "Meeting", typeId: null };
}

function buildDependencies(options: {
  items?: Partial<Record<VaultPath, readonly TaskItem[]>>;
  structures?: Partial<Record<VaultPath, NoteStructure>>;
  notes?: AnchorMap;
  ends?: EndMap;
  notelets?: NoteletMap;
  journalFilters?: Partial<Record<string, TaskRule>>;
  // Journals the repository does not know, and journals whose cycle cannot place a date.
  unknownJournals?: readonly string[];
  journalsWithoutCycle?: readonly string[];
  // A real TaskIndex a provider published into, layered under the fixture's own items: datedIn is
  // the index's range lookup, and itemsIn at a task note's path answers what containment would see.
  published?: Pick<TaskIndex, "itemsIn" | "datedIn">;
  visibility?: Pick<TaskVisibility, "admits">;
}): TaskListingDependencies {
  const {
    items = {},
    structures = {},
    notes = {},
    ends = {},
    notelets = {},
    journalFilters = {},
    unknownJournals = [],
    journalsWithoutCycle = [],
    published,
    visibility = { admits: () => true },
  } = options;
  const endAnchorOf = (name: string, anchor: AnchorString): AnchorString =>
    (ends[name]?.[anchor] ?? anchor) as AnchorString;
  return {
    journals: {
      get: (name) => {
        if (unknownJournals.includes(name)) return Option.none();
        const base = fixedJournal(name, { type: name === "Monthly" ? "month" : "day" });
        const filter = journalFilters[name];
        return Option.some(filter ? { ...base, tasks: { ...base.tasks, filter } } : base);
      },
    },
    index: {
      get: (name, anchor) => Option.fromNullable(notes[name]?.[anchor]),
      getRange: (name, start, end) => {
        const found = new Map<AnchorString, VaultPath>();
        const known = Object.entries(notes[name] ?? {});
        for (const [anchor, path] of known) {
          if (anchor >= start && anchor <= end) found.set(anchor as AnchorString, path);
        }
        return found;
      },
      noteletsAt: (name, anchor) => (notelets[name]?.[anchor] ?? []).map((path) => noteletEntry(name, anchor, path)),
      noteletAnchorsInRange: (name, start, end) =>
        Object.keys(notelets[name] ?? {})
          .filter((anchor) => anchor >= start && anchor <= end)
          .toSorted() as AnchorString[],
    },
    cycle: {
      startOf: (name, anchor) =>
        journalsWithoutCycle.includes(name) ? Option.none() : Option.some(CalendarDate.fromAnchor(anchor)),
      endOf: (name, anchor) =>
        journalsWithoutCycle.includes(name)
          ? Option.none()
          : Option.some(CalendarDate.fromAnchor(endAnchorOf(name, anchor))),
      // The period holding a date can open before it, which is the whole reason the listing
      // widens its lower bound; the latest known anchor at or before the date models that.
      anchorOf: (name, date) => {
        if (journalsWithoutCycle.includes(name)) return Option.none();
        const target = date.toAnchor();
        const known = Object.keys(notes[name] ?? {}).toSorted();
        return Option.some((known.findLast((anchor) => anchor <= target) ?? target) as AnchorString);
      },
      overlapsFrom: (name, anchor, start) => anchor >= start || endAnchorOf(name, anchor) >= start,
    },
    structure: { get: (path) => Option.fromNullable(structures[path] ?? EMPTY_STRUCTURE) },
    visibility,
    tasks: {
      itemsIn: (path) => [...(items[path] ?? []), ...(published?.itemsIn(path) ?? [])],
      datedIn: (roles, start, end) => published?.datedIn(roles, start, end) ?? [],
      // Hydration is the seam under test only for its position in the pipeline; give every line
      // item a markdown so the rows are complete.
      hydrate: (given) =>
        Promise.resolve(
          given.map((item) =>
            item.display.kind === "line"
              ? { ...item, display: { ...item.display, markdown: `- [ ] ${item.key}` } }
              : item,
          ),
        ),
    },
  };
}

function request(overrides: Partial<TaskListingPeriodRequest> = {}): TaskListingPeriodRequest {
  return {
    kind: "period",
    hostJournal: "Daily",
    anchor: "2026-09-22" as AnchorString,
    journalNames: ["Daily"],
    query: DEFAULT_TASK_QUERY,
    ...overrides,
  };
}

const withQuery = (query: Partial<TaskQuery>): TaskQuery => ({ ...DEFAULT_TASK_QUERY, ...query });

// Shared by the notelet-anchor-scan spy test: a Monthly rollup over Daily, varying only `source`.
function monthlyRollupOverDaily(source: TaskQuery["scope"]["source"]): TaskListingPeriodRequest {
  return request({
    hostJournal: "Monthly",
    anchor: "2026-09-01" as AnchorString,
    journalNames: ["Daily"],
    query: withQuery({ scope: { provider: [], source, depth: "rollup" } }),
  });
}

// What a bare fence, and a view block whose filter the user emptied, both hand the listing.
const NO_CONDITIONS: TaskRule = { mode: "and", conditions: [] };

describe("buildTaskListing", () => {
  it("returns the period note's open items in document order and leaves the done one out", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [
          line(DAY, 5, { status: "done" }),
          line(DAY, 3, { status: "todo" }),
          line(DAY, 4, { status: "in-progress" }),
        ],
      },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:3`, `${DAY}:4`]);
  });

  // The rolled-up scope deliberately leaves the host journal out: with it in, the rollup walk finds
  // the month note by itself and the assertion holds even for a rollup that replaced the literal
  // target instead of widening it.
  it("widens rather than replaces on rollup — the month note's own items stay alongside its days'", async () => {
    const dependencies = buildDependencies({
      items: {
        [MONTH]: [line(MONTH, 1), line(MONTH, 6, { status: "done" })],
        [DAY]: [line(DAY, 3)],
        [OTHER_DAY]: [line(OTHER_DAY, 3), line(OTHER_DAY, 8, { status: "done" })],
      },
      notes: {
        Monthly: { "2026-09-01": MONTH },
        Daily: { "2026-09-22": DAY, "2026-09-23": OTHER_DAY },
      },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.source.path)).toEqual([MONTH, DAY, OTHER_DAY]);
  });

  it("lists the host journal's own period once when the rolled-up scope holds it too", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 1), line(MONTH, 4, { status: "done" })], [DAY]: [line(DAY, 3)] },
      notes: { Monthly: { "2026-09-01": MONTH }, Daily: { "2026-09-22": DAY } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Monthly", "Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${MONTH}:1`, `${DAY}:3`]);
  });

  it("rolls up a period that opened before the target and drops one that had already closed", async () => {
    const dependencies = buildDependencies({
      items: {
        [MONTH]: [],
        [WEEK]: [line(WEEK, 3)],
        [SPRINT]: [line(SPRINT, 3)],
        [LATER_SPRINT]: [line(LATER_SPRINT, 3)],
      },
      notes: {
        Monthly: { "2026-09-01": MONTH },
        Weekly: { "2026-08-31": WEEK },
        Sprints: { "2026-08-25": SPRINT, "2026-09-05": LATER_SPRINT },
      },
      ends: {
        Monthly: { "2026-09-01": "2026-09-30" },
        Weekly: { "2026-08-31": "2026-09-06" },
        Sprints: { "2026-08-25": "2026-08-28", "2026-09-05": "2026-09-10" },
      },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Monthly", "Weekly", "Sprints"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.source.path)).toEqual([WEEK, LATER_SPRINT]);
  });

  it("adds a notelet's items under source: both and omits them under source: note", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [line(DAY, 3), line(DAY, 6, { status: "done" })],
        [NOTELET]: [line(NOTELET, 2), line(NOTELET, 5, { status: "done" })],
      },
      notes: { Daily: { "2026-09-22": DAY } },
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const both = await buildTaskListing(dependencies, request());
    expect(both.map((row) => row.source.kind)).toEqual(["note", "notelet"]);

    const noteOnly = await buildTaskListing(
      dependencies,
      request({ query: withQuery({ scope: { provider: [], source: "note", depth: "literal" } }) }),
    );
    expect(noteOnly.map((row) => row.source.path)).toEqual([DAY]);
  });

  it("labels each row's source with the basename of the note it came from", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [line(DAY, 3), line(DAY, 6, { status: "done" })],
        [NOTELET]: [line(NOTELET, 2), line(NOTELET, 5, { status: "done" })],
      },
      notes: { Daily: { "2026-09-22": DAY } },
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => row.source.label)).toEqual(["2026-09-22", "2026-09-22 Standup"]);
  });

  it("leaves the period note's own items out under source: notelets", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [line(DAY, 3), line(DAY, 6, { status: "done" })],
        [NOTELET]: [line(NOTELET, 2), line(NOTELET, 5, { status: "done" })],
      },
      notes: { Daily: { "2026-09-22": DAY } },
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({ query: withQuery({ scope: { provider: [], source: "notelets", depth: "literal" } }) }),
    );
    expect(rows.map((row) => row.source.path)).toEqual([NOTELET]);
  });

  it("reaches a notelet whose own period note is not indexed", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3)], [NOTELET]: [line(NOTELET, 2, { status: "done" }), line(NOTELET, 4)] },
      notes: {},
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => row.key)).toEqual([`${NOTELET}:4`]);
  });

  it("rolls up a period whose only notes are notelets, its own period note never having been created", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [], [NOTELET]: [line(NOTELET, 2)] },
      notes: { Monthly: { "2026-09-01": MONTH } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Daily"],
        query: withQuery({ scope: { provider: [], source: "both", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${NOTELET}:2`]);
  });

  it("leaves a notelet-only period out of a rollup entirely under source: note", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 1)], [NOTELET]: [line(NOTELET, 2)] },
      notes: { Monthly: { "2026-09-01": MONTH } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${MONTH}:1`]);
  });

  // Pins the saving periodsWithin's own comment claims: under source: "note" the notelet-anchor
  // range query is skipped outright, not just discarded after running. Delete the `if (source !==
  // "note")` guard and this fails on the first assertion while the listing's output-only tests above
  // stay green — the gate has no other falsifier.
  it("skips the notelet-anchor scan under source: note, and runs it under source: both", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 1)] },
      notes: { Monthly: { "2026-09-01": MONTH } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const noteletAnchorsInRange = vi.fn(dependencies.index.noteletAnchorsInRange);
    const spiedDependencies: TaskListingDependencies = {
      ...dependencies,
      index: { ...dependencies.index, noteletAnchorsInRange },
    };
    await buildTaskListing(spiedDependencies, monthlyRollupOverDaily("note"));
    expect(noteletAnchorsInRange).not.toHaveBeenCalled();

    await buildTaskListing(spiedDependencies, monthlyRollupOverDaily("both"));
    expect(noteletAnchorsInRange).toHaveBeenCalled();
  });

  it("keeps a notelet out of a rollup when its own period had already closed before the target", async () => {
    const dependencies = buildDependencies({
      items: {
        [MONTH]: [],
        [CLOSED_SPRINT_NOTELET]: [line(CLOSED_SPRINT_NOTELET, 2)],
        [LATER_SPRINT_NOTELET]: [line(LATER_SPRINT_NOTELET, 2)],
      },
      notes: { Monthly: { "2026-09-01": MONTH }, Sprints: { "2026-08-25": SPRINT } },
      ends: {
        Monthly: { "2026-09-01": "2026-09-30" },
        Sprints: { "2026-08-25": "2026-08-28", "2026-08-29": "2026-08-31" },
      },
      notelets: { Sprints: { "2026-08-29": [CLOSED_SPRINT_NOTELET], "2026-09-05": [LATER_SPRINT_NOTELET] } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Sprints"],
        query: withQuery({ scope: { provider: [], source: "both", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${LATER_SPRINT_NOTELET}:2`]);
  });

  it("renders a filtered-out parent as a context row above its matching child", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "done" }), child(DAY, 4, 3, { status: "todo" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.item.status, row.context, row.depth])).toEqual([
      ["done", true, 0],
      ["todo", false, 1],
    ]);
  });

  it("hydrates a context row too, so it has something to render", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "done" }), child(DAY, 4, 3, { status: "todo" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    const display = rows.at(0)?.item.display;
    expect(rows.at(0)?.context).toBe(true);
    expect(display?.kind === "line" && display.markdown).toBeTruthy();
  });

  it("renders a child whose parent is not itself a task as a root, with no context row", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [child(DAY, 4, 3), line(DAY, 6, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.depth, row.context])).toEqual([[0, false]]);
  });

  it("keeps a whole filtered-out ancestor chain as context above the item that matched", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [
          line(DAY, 3, { status: "done" }),
          child(DAY, 4, 3, { status: "done" }),
          child(DAY, 5, 4, { status: "todo" }),
        ],
      },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.key, row.depth, row.context])).toEqual([
      [`${DAY}:3`, 0, true],
      [`${DAY}:4`, 1, true],
      [`${DAY}:5`, 2, false],
    ]);
  });

  it("lists a note-shaped item as a root of its own", async () => {
    const noteItem = buildTaskItem({
      path: DAY,
      key: `${DAY}#note`,
      display: { kind: "note", path: DAY, title: "Ship it" },
    });
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3), line(DAY, 5, { status: "done" }), noteItem] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.key, row.depth])).toEqual([
      [`${DAY}#note`, 0],
      [`${DAY}:3`, 0],
    ]);
  });

  it("filters a note no journal owns by the query's filter alone", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3), line(DAY, 5, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
      journalFilters: {
        Daily: { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["cancelled"] }] },
      },
      unknownJournals: ["Daily"],
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:3`]);
  });

  it("leaves a rolled-up journal out when its cycle cannot place the window's start", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 1)], [DAY]: [line(DAY, 3)] },
      notes: { Monthly: { "2026-09-01": MONTH }, Daily: { "2026-09-22": DAY } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
      journalsWithoutCycle: ["Daily"],
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${MONTH}:1`]);
  });

  it("falls back to the literal target when the host period has no bounds to roll up over", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 1), line(MONTH, 4, { status: "done" })], [DAY]: [line(DAY, 3)] },
      notes: { Monthly: { "2026-09-01": MONTH }, Daily: { "2026-09-22": DAY } },
      journalsWithoutCycle: ["Monthly"],
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Monthly", "Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${MONTH}:1`]);
  });

  it("terminates on an item that names itself as its own parent", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [child(DAY, 3, 3), line(DAY, 5, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.key, row.depth])).toEqual([[`${DAY}:3`, 0]]);
  });

  it("drops a non-task item before the filter or the sort can see it", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "non-task" }), line(DAY, 4, { status: "todo" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({ query: withQuery({ filter: { mode: "and", conditions: [] } }) }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:4`]);
  });

  it("does not pull a non-task parent in as a context row, and roots its child", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "non-task" }), child(DAY, 4, 3, { status: "todo" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.key, row.depth])).toEqual([[`${DAY}:4`, 0]]);
  });

  // A bare fence and a view block whose filter names no status both arrive here with an empty
  // condition list; the listing's own `status: open` default is applied at composition, so it
  // reaches both without either surface having to emit it.
  it("defaults a surface that names no status to open items", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "todo" }), line(DAY, 4, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ filter: NO_CONDITIONS }) }));
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:3`]);
  });

  it("lets the journal's own status condition stand where the surface names none", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3, { status: "todo" }), line(DAY, 4, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
      journalFilters: {
        Daily: { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["done"] }] },
      },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ filter: NO_CONDITIONS }) }));
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:4`]);
  });

  // Heading fixtures carry no "#" — see filter.test.ts's own note on HeadingCache.heading.
  it("applies the owning journal's filter, and lets the query's condition of the same type replace it", async () => {
    const structures: Partial<Record<VaultPath, NoteStructure>> = {
      [DAY]: {
        listItems: [
          { marker: " ", line: 3, endLine: 3, parent: null },
          { marker: " ", line: 7, endLine: 7, parent: null },
        ],
        tags: [],
        headings: [
          { heading: "Tasks", level: 2, line: 1 },
          { heading: "Log", level: 2, line: 5 },
        ],
        frontmatterTags: [],
      },
    };
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3), line(DAY, 7)] },
      structures,
      notes: { Daily: { "2026-09-22": DAY } },
      journalFilters: {
        Daily: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }] },
      },
    });

    const inherited = await buildTaskListing(dependencies, request());
    expect(inherited.map((row) => row.key)).toEqual([`${DAY}:3`]);

    const overridden = await buildTaskListing(
      dependencies,
      request({
        query: withQuery({
          filter: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["Log"] }] },
        }),
      }),
    );
    expect(overridden.map((row) => row.key)).toEqual([`${DAY}:7`]);
  });

  it("filters each note by its own journal's stored filter on a rollup", async () => {
    const structure: NoteStructure = {
      listItems: [
        { marker: " ", line: 3, endLine: 3, parent: null },
        { marker: " ", line: 7, endLine: 7, parent: null },
      ],
      tags: [],
      headings: [
        { heading: "Tasks", level: 2, line: 1 },
        { heading: "Log", level: 2, line: 5 },
      ],
      frontmatterTags: [],
    };
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 3), line(MONTH, 7)], [DAY]: [line(DAY, 3), line(DAY, 7)] },
      structures: { [MONTH]: structure, [DAY]: structure },
      notes: { Monthly: { "2026-09-01": MONTH }, Daily: { "2026-09-22": DAY } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
      journalFilters: {
        Monthly: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }] },
        Daily: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["Log"] }] },
      },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Monthly", "Daily"],
        query: withQuery({ scope: { provider: [], source: "note", depth: "rollup" } }),
      }),
    );
    expect(rows.map((row) => row.key)).toEqual([`${MONTH}:3`, `${DAY}:7`]);
  });

  it("narrows to one provider when the scope names it", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3), line(DAY, 4, { provider: "note-property", key: `${DAY}:np` })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({ query: withQuery({ scope: { provider: ["checkbox"], source: "both", depth: "literal" } }) }),
    );
    expect(rows.map((row) => row.item.provider)).toEqual(["checkbox"]);
  });

  it("hydrates every line row's markdown before returning", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3), line(DAY, 5, { status: "done" })] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    const display = rows.at(0)?.item.display;
    expect(display?.kind === "line" && display.markdown).toBeTruthy();
  });

  it("orders by status when the sort names it, keeping document order within a status", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [
          line(DAY, 3, { status: "on-hold" }),
          line(DAY, 4, { status: "in-progress" }),
          line(DAY, 5, { status: "todo" }),
          line(DAY, 6, { status: "done" }),
          line(DAY, 7, { status: "todo" }),
        ],
      },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ sort: "status" }) }));
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:5`, `${DAY}:7`, `${DAY}:4`, `${DAY}:3`]);
  });

  it("orders by a date role, putting an item carrying no such date last", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [
          line(DAY, 3, { dates: { due: "2026-10-05" as AnchorString } }),
          line(DAY, 4),
          line(DAY, 5, { dates: { due: "2026-09-30" as AnchorString } }),
          line(DAY, 6, { status: "done", dates: { due: "2026-09-01" as AnchorString } }),
          line(DAY, 7, { dates: { due: "2026-09-30" as AnchorString } }),
          line(DAY, 8, { dates: { due: "2026-12-01" as AnchorString } }),
        ],
      },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ sort: "due" }) }));
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:5`, `${DAY}:7`, `${DAY}:3`, `${DAY}:8`, `${DAY}:4`]);
  });

  it("keeps a child under its own parent when a sort reorders the roots", async () => {
    const dependencies = buildDependencies({
      items: {
        [DAY]: [
          line(DAY, 3, { status: "on-hold" }),
          child(DAY, 4, 3, { status: "todo" }),
          line(DAY, 8, { status: "todo" }),
          line(DAY, 12, { status: "done" }),
        ],
      },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ sort: "status" }) }));
    expect(rows.map((row) => [row.key, row.depth])).toEqual([
      [`${DAY}:8`, 0],
      [`${DAY}:3`, 0],
      [`${DAY}:4`, 1],
    ]);
  });
});

// The view block has no single host note — its window is a calendar span picked independently of
// any journal's own cycle, and the journal list handed in is already the block's whole explicit
// scope. This request shape walks every named journal's own periods inside the window directly,
// the same periodsWithin primitive rollup uses to widen past a host.
describe("buildTaskListing — window request", () => {
  it("gathers each named journal's own periods within the window, not just one host's", async () => {
    const dependencies = buildDependencies({
      items: { [MONTH]: [line(MONTH, 1)], [DAY]: [line(DAY, 3)], [OTHER_DAY]: [line(OTHER_DAY, 3)] },
      notes: {
        Monthly: { "2026-09-01": MONTH },
        Daily: { "2026-09-22": DAY, "2026-09-23": OTHER_DAY },
      },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
    });
    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Monthly", "Daily"],
      window: { start: "2026-09-01" as AnchorString, end: "2026-09-30" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });
    expect(rows.map((row) => row.source.path)).toEqual([MONTH, DAY, OTHER_DAY]);
  });

  it("never widens beyond the journals it is given, having no host to widen from", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3)] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Daily"],
      window: { start: "2026-09-01" as AnchorString, end: "2026-09-30" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });
    expect(rows.map((row) => row.source.path)).toEqual([DAY]);
  });

  it("reaches a notelet inside the window whose own period note does not exist", async () => {
    const dependencies = buildDependencies({
      items: { [NOTELET]: [line(NOTELET, 2)] },
      notes: {},
      notelets: { Daily: { "2026-09-22": [NOTELET] } },
    });
    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Daily"],
      window: { start: "2026-09-01" as AnchorString, end: "2026-09-30" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });
    expect(rows.map((row) => row.key)).toEqual([`${NOTELET}:2`]);
  });

  // getRange and noteletsFor each hand periodsWithin their entries in whatever order the fixture
  // authored them, not anchor order — the merge relies on its own `.toSorted` to fix that up. Notes
  // authored out of order, with a notelet anchor landing between them, is what makes a reversed or
  // dropped comparator visible; every other fixture in this file happens to author notes already
  // sorted, so it would pass unnoticed there.
  it("sorts the merged periods by anchor even when the index and the notelet scan hand them out of order", async () => {
    const dependencies = buildDependencies({
      items: {
        [SPRINT]: [line(SPRINT, 3)],
        [CLOSED_SPRINT_NOTELET]: [line(CLOSED_SPRINT_NOTELET, 2)],
        [LATER_SPRINT]: [line(LATER_SPRINT, 3)],
      },
      notes: { Sprints: { "2026-09-05": LATER_SPRINT, "2026-08-25": SPRINT } },
      notelets: { Sprints: { "2026-08-29": [CLOSED_SPRINT_NOTELET] } },
    });
    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Sprints"],
      window: { start: "2026-08-01" as AnchorString, end: "2026-09-30" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });
    expect(rows.map((row) => row.source.path)).toEqual([SPRINT, CLOSED_SPRINT_NOTELET, LATER_SPRINT]);
  });

  it("dedupes a journal named more than once within the window", async () => {
    const dependencies = buildDependencies({
      items: { [DAY]: [line(DAY, 3)] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Daily", "Daily"],
      window: { start: "2026-09-01" as AnchorString, end: "2026-09-30" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:3`]);
  });
});

const TASK_NOTE = "Tasks/a.md" as VaultPath;

interface TaskNoteFixture {
  readonly tags?: readonly string[];
  readonly properties: Record<string, unknown>;
}

// The note-property provider enabled and started over the given task notes, so the index the
// listing reads is the one a real provider published into, and the visibility it asks is the one
// those journals' stored rules answer.
async function publishedHarness(
  fixtures: Partial<Record<VaultPath, TaskNoteFixture>>,
  journals: Record<string, JournalConfig> = {},
) {
  const notes = new FakeNotesService();
  const metadata = new FakeNoteMetadataService();
  const structures = new FakeNoteStructureService();
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { tasksNoteProperty: { enabled: true }, journals },
    overrides: [
      overrideWith(NotesService, notes as never),
      overrideWith(NoteMetadataService, metadata as never),
      overrideWith(NoteStructureService, structures as never),
    ],
  });
  harness.resolve(JournalsIndex).markReady();
  const setTaskNote = (path: VaultPath, fixture: TaskNoteFixture) => {
    const tags = [...(fixture.tags ?? ["#task"])];
    metadata.setMetadata(path, { title: "a", tags, properties: fixture.properties });
    structures.setStructure(path, { ...EMPTY_STRUCTURE, frontmatterTags: tags });
  };
  for (const [path, fixture] of Object.entries(fixtures) as [VaultPath, TaskNoteFixture][]) {
    notes.seed(path);
    setTaskNote(path, fixture);
  }
  const provider = harness.resolve(TaskProviderToken).find((candidate) => candidate.id === NOTE_PROPERTY_PROVIDER_ID);
  if (!(provider instanceof NotePropertyTaskProvider)) throw new TypeError("note-property provider not registered");
  provider.start();
  return {
    index: harness.resolve(TaskIndex),
    visibility: harness.resolve(TaskVisibility),
    notes,
    setTaskNote,
  };
}

async function publishedTaskNotes(fixtures: Partial<Record<VaultPath, TaskNoteFixture>>): Promise<TaskIndex> {
  const { index } = await publishedHarness(fixtures);
  return index;
}

const scheduledOn = (day: string, extra: Record<string, unknown> = {}): TaskNoteFixture => ({
  properties: { scheduled: day, ...extra },
});

const tagFilter = (tag: string): TaskRule => ({
  mode: "and",
  conditions: [{ type: "tag", condition: "has", tags: [tag] }],
});

describe("buildTaskListing — dated task notes", () => {
  it("lists a task note once on the day its date falls on, and not on the next", async () => {
    const published = await publishedTaskNotes({ [TASK_NOTE]: scheduledOn("2026-09-22") });
    const dependencies = buildDependencies({ published });

    const rows = await buildTaskListing(dependencies, request());
    expect(rows).toHaveLength(1);
    expect(rows.at(0)?.item.relations).toContain("date");
    expect(rows.at(0)?.source).toEqual({ kind: "task-note", path: TASK_NOTE, label: "a" });
    expect(rows.at(0)?.depth).toBe(0);
    expect(rows.at(0)?.context).toBe(false);

    const next = await buildTaskListing(dependencies, request({ anchor: "2026-09-23" as AnchorString }));
    expect(next).toEqual([]);
  });

  it("lists it on the week and the month holding its date, by the period's range", async () => {
    const published = await publishedTaskNotes({ [TASK_NOTE]: scheduledOn("2026-09-23") });
    const dependencies = buildDependencies({
      published,
      ends: { Weekly: { "2026-09-21": "2026-09-27" }, Monthly: { "2026-09-01": "2026-09-30" } },
    });

    const week = await buildTaskListing(
      dependencies,
      request({ hostJournal: "Weekly", anchor: "2026-09-21" as AnchorString, journalNames: ["Weekly"] }),
    );
    const month = await buildTaskListing(
      dependencies,
      request({ hostJournal: "Monthly", anchor: "2026-09-01" as AnchorString, journalNames: ["Monthly"] }),
    );
    expect(week.map((row) => row.source.path)).toEqual([TASK_NOTE]);
    expect(month.map((row) => row.source.path)).toEqual([TASK_NOTE]);
  });

  it("adds no dated items when the host journal's cycle cannot place the period", async () => {
    const published = await publishedTaskNotes({ [TASK_NOTE]: scheduledOn("2026-09-22") });
    const rows = await buildTaskListing(buildDependencies({ published, journalsWithoutCycle: ["Daily"] }), request());
    expect(rows).toEqual([]);
  });

  it("takes only the role the surface names", async () => {
    const published = await publishedTaskNotes({ [TASK_NOTE]: scheduledOn("2026-09-22") });
    const dependencies = buildDependencies({ published });
    expect(await buildTaskListing(dependencies, request({ query: withQuery({ date: "due" }) }))).toEqual([]);
    expect(await buildTaskListing(dependencies, request({ query: withQuery({ date: "scheduled" }) }))).toHaveLength(1);
  });

  it("does not let the journal's stored tag condition hide a task note", async () => {
    const published = await publishedTaskNotes({ [TASK_NOTE]: scheduledOn("2026-09-22") });
    const dependencies = buildDependencies({ published, journalFilters: { Daily: tagFilter("#work") } });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => row.source.path)).toEqual([TASK_NOTE]);
  });

  it("matches a tag the surface names against the task note's frontmatter tags", async () => {
    const tagged = "Tasks/b.md" as VaultPath;
    const published = await publishedTaskNotes({
      [TASK_NOTE]: scheduledOn("2026-09-22"),
      [tagged]: { tags: ["#task", "#work"], properties: { scheduled: "2026-09-22" } },
    });
    const dependencies = buildDependencies({
      published,
      structures: {
        [TASK_NOTE]: { ...EMPTY_STRUCTURE, frontmatterTags: ["#task"] },
        [tagged]: { ...EMPTY_STRUCTURE, frontmatterTags: ["#task", "#work"] },
      },
    });
    const rows = await buildTaskListing(dependencies, request({ query: withQuery({ filter: tagFilter("#work") }) }));
    expect(rows.map((row) => row.source.path)).toEqual([tagged]);
  });

  it("lets the journal's stored status condition hide a task note", async () => {
    const published = await publishedTaskNotes({ [TASK_NOTE]: scheduledOn("2026-09-22") });
    const dependencies = buildDependencies({
      published,
      journalFilters: { Daily: { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["done"] }] } },
    });
    expect(await buildTaskListing(dependencies, request())).toEqual([]);
  });

  it("gathers dated items for the host period alone under rollup, so a task note appears once", async () => {
    const published = await publishedTaskNotes({ [TASK_NOTE]: scheduledOn("2026-09-22") });
    const dependencies = buildDependencies({
      published,
      items: { [DAY]: [line(DAY, 3)], [OTHER_DAY]: [line(OTHER_DAY, 3)] },
      notes: { Daily: { "2026-09-22": DAY, "2026-09-23": OTHER_DAY } },
      ends: { Monthly: { "2026-09-01": "2026-09-30" } },
    });
    const rows = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Monthly",
        anchor: "2026-09-01" as AnchorString,
        journalNames: ["Monthly", "Daily"],
        query: withQuery({ scope: { provider: [], source: "both", depth: "rollup" } }),
      }),
    );
    expect(rows.filter((row) => row.source.kind === "task-note")).toHaveLength(1);
    expect(rows.map((row) => row.key)).toEqual([`${DAY}:3`, `${OTHER_DAY}:3`, "note-property:Tasks/a.md"]);
  });

  it("lists a dated item whatever the source, which it is not reached through", async () => {
    const published = await publishedTaskNotes({ [TASK_NOTE]: scheduledOn("2026-09-22") });
    const dependencies = buildDependencies({ published, notes: { Daily: { "2026-09-22": DAY } } });
    const rows = await buildTaskListing(
      dependencies,
      request({ query: withQuery({ scope: { provider: [], source: "notelets", depth: "literal" } }) }),
    );
    expect(rows.map((row) => row.source.path)).toEqual([TASK_NOTE]);
  });

  it("keeps the provider scope over dated items", async () => {
    const published = await publishedTaskNotes({ [TASK_NOTE]: scheduledOn("2026-09-22") });
    const dependencies = buildDependencies({ published });
    const rows = await buildTaskListing(
      dependencies,
      request({ query: withQuery({ scope: { provider: ["checkbox"], source: "both", depth: "literal" } }) }),
    );
    expect(rows).toEqual([]);
  });

  it("lists a task note once in a window over two journals", async () => {
    const published = await publishedTaskNotes({ [TASK_NOTE]: scheduledOn("2026-09-22") });
    const dependencies = buildDependencies({
      published,
      notes: { Daily: { "2026-09-22": DAY }, Work: { "2026-09-22": OTHER_DAY } },
    });
    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Daily", "Work"],
      window: { start: "2026-09-21" as AnchorString, end: "2026-09-27" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });
    expect(rows.map((row) => row.source.path)).toEqual([TASK_NOTE]);
  });

  it("lists a task note that is also the period's own note once, beside that note's checkboxes", async () => {
    const published = await publishedTaskNotes({ [DAY]: scheduledOn("2026-09-22") });
    const dependencies = buildDependencies({
      published,
      items: { [DAY]: [line(DAY, 3)] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.key, row.source.kind])).toEqual([
      [`${DAY}:3`, "note"],
      [`note-property:${DAY}`, "task-note"],
    ]);
  });

  // No shipped provider yields an item with both relations yet; the model already allows one.
  it("lists an item reached by both relations once, as the containment row", async () => {
    const both = line(DAY, 3, { relations: ["containment", "date"], dates: { due: "2026-09-22" as AnchorString } });
    const dependencies = buildDependencies({
      published: { itemsIn: (path) => (path === DAY ? [both] : []), datedIn: () => [both] },
      notes: { Daily: { "2026-09-22": DAY } },
    });
    const rows = await buildTaskListing(dependencies, request());
    expect(rows.map((row) => [row.key, row.source.kind])).toEqual([[`${DAY}:3`, "note"]]);
  });

  it("does not gather a date-only item by containment from the note it sits in", async () => {
    const published = await publishedTaskNotes({ [DAY]: scheduledOn("2026-09-25") });
    const dependencies = buildDependencies({ published, notes: { Daily: { "2026-09-22": DAY } } });
    expect(await buildTaskListing(dependencies, request())).toEqual([]);
  });
});

const dayOf = (journal: string): TaskListingPeriodRequest => request({ hostJournal: journal, journalNames: [journal] });

describe("buildTaskListing — task-note visibility", () => {
  const WORK_NOTE = "Tasks/work.md" as VaultPath;
  const HOME_NOTE = "Tasks/home.md" as VaultPath;
  const noFilter: TaskRule = { mode: "and", conditions: [] };
  const withRule = (name: string, rule: VisibilityRule): JournalConfig =>
    fixedJournal(name, { type: "day" }, { tasks: { filter: noFilter, providers: { "note-property": rule } } });
  const matchingWork: VisibilityRule = {
    show: "matching",
    mode: "and",
    conditions: [{ type: "tag", tags: ["#work"] }],
  };
  const hidden: VisibilityRule = { show: "none", mode: "and", conditions: [] };
  const twoJournals = { Work: withRule("Work", matchingWork), Personal: withRule("Personal", hidden) };
  const workAndHome = {
    [WORK_NOTE]: { tags: ["#task", "#work"], properties: { scheduled: "2026-09-22" } },
    [HOME_NOTE]: { tags: ["#task", "#home"], properties: { scheduled: "2026-09-22" } },
  };

  it("shows a day only the task notes its own journal admits", async () => {
    const { index, visibility } = await publishedHarness(workAndHome, twoJournals);
    const dependencies = buildDependencies({ published: index, visibility });

    const work = await buildTaskListing(dependencies, dayOf("Work"));
    const personal = await buildTaskListing(dependencies, dayOf("Personal"));

    expect(work.map((row) => row.source.path)).toEqual([WORK_NOTE]);
    expect(personal).toEqual([]);
  });

  it("asks the host journal for a period, not the journals it rolls up", async () => {
    const { index, visibility } = await publishedHarness(workAndHome, twoJournals);
    const dependencies = buildDependencies({ published: index, visibility });

    const rows = await buildTaskListing(
      dependencies,
      request({ hostJournal: "Personal", journalNames: ["Personal", "Work"] }),
    );

    expect(rows).toEqual([]);
  });

  it("lists a task note once in a window when any of its journals admits it", async () => {
    const { index, visibility } = await publishedHarness(workAndHome, twoJournals);
    const dependencies = buildDependencies({ published: index, visibility });

    const rows = await buildTaskListing(dependencies, {
      kind: "window",
      journalNames: ["Personal", "Work"],
      window: { start: "2026-09-21" as AnchorString, end: "2026-09-27" as AnchorString },
      query: DEFAULT_TASK_QUERY,
    });

    expect(rows.map((row) => row.source.path)).toEqual([WORK_NOTE]);
  });

  it("gains a task note once its frontmatter tag starts matching the journal's rule", async () => {
    const { index, visibility, notes, setTaskNote } = await publishedHarness(
      { [HOME_NOTE]: { tags: ["#task", "#home"], properties: { scheduled: "2026-09-22" } } },
      twoJournals,
    );
    const dependencies = buildDependencies({ published: index, visibility });
    expect(await buildTaskListing(dependencies, dayOf("Work"))).toEqual([]);
    const before = index.version();

    setTaskNote(HOME_NOTE, { tags: ["#task", "#work"], properties: { scheduled: "2026-09-22" } });
    notes.emitMetadataChanged(HOME_NOTE);

    expect(index.version()).toBe(before + 1);
    const rows = await buildTaskListing(dependencies, dayOf("Work"));
    expect(rows.map((row) => row.source.path)).toEqual([HOME_NOTE]);
  });
});

const PROJECT = "project/ideas.md" as VaultPath;

async function publishedCheckboxes(items: readonly TaskItem[]): Promise<TaskIndex> {
  const harness = await testContainer({ modules: [journalsCoreModule, tasksCoreModule] });
  const index = harness.resolve(TaskIndex);
  index.publish(CHECKBOX_PROVIDER_ID, "all", items);
  return index;
}

describe("buildTaskListing — dated checkbox lines", () => {
  it("a dated checkbox in a project note lists in its day and once in its week", async () => {
    const published = await publishedCheckboxes([
      line(PROJECT, 1, { relations: ["date"], dates: { due: "2026-09-23" as AnchorString } }),
    ]);
    const dependencies = buildDependencies({
      published,
      notes: { Daily: { "2026-09-22": DAY, "2026-09-23": OTHER_DAY } },
      ends: { Weekly: { "2026-09-21": "2026-09-27" } },
    });

    const day = await buildTaskListing(dependencies, request({ anchor: "2026-09-23" as AnchorString }));
    const week = await buildTaskListing(
      dependencies,
      request({
        hostJournal: "Weekly",
        anchor: "2026-09-21" as AnchorString,
        journalNames: ["Weekly", "Daily"],
        query: withQuery({ scope: { provider: [], source: "both", depth: "rollup" } }),
      }),
    );

    expect(day.map((row) => row.item.key)).toEqual([`${PROJECT}:1`]);
    expect(day.at(0)?.source).toEqual({ kind: "task-note", path: PROJECT, label: "ideas" });
    expect(week.map((row) => row.item.key)).toEqual([`${PROJECT}:1`]);
  });

  it("an owned line matched by both relations lists once", async () => {
    const published = await publishedCheckboxes([
      line(DAY, 3, { relations: ["containment", "date"], dates: { due: "2026-09-22" as AnchorString } }),
    ]);
    const dependencies = buildDependencies({ published, notes: { Daily: { "2026-09-22": DAY } } });

    const rows = await buildTaskListing(dependencies, request());

    expect(rows.map((row) => row.item.key)).toEqual([`${DAY}:3`]);
    expect(rows.at(0)?.source.kind).toBe("note");
  });
});
