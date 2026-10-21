import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { UserAborted } from "@/infrastructure/flows";
import {
  NoteNotFoundError,
  NoteStructureService,
  NotesService,
  NoteWriteError,
  type NoteStructure,
  type VaultPath,
} from "@/infrastructure/host";
import { FakeNoteStructureService, FakeNotesService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { SettingsService } from "@/settings";
import { overrideWith, testContainer } from "@/testing";

import { taskRuleSchema, type TaskRule } from "../conditions";
import { tasksCoreModule } from "../module";
import { checkboxSlice } from "../providers/checkbox/slice";
import { NOTE_PROPERTY_PROVIDER_ID } from "../providers/note-property/slice";
import { TaskIndex } from "../task-index";
import { buildTaskItem } from "../testing";

import { rollNotice, type RollReport } from "./report";
import { RolloverService } from "./rollover-service";
import { journalMoveSchema, type JournalMoveConfig } from "./settings";

const TODAY = "2026-10-21";

// The structure Obsidian would report for the text: checkbox lines, headings, inline tags.
function structureOf(text: string): NoteStructure {
  const lines = text.split("\n");
  return {
    listItems: lines.flatMap((line, index) => {
      const marker = /^\s*[-*+]\s+\[(.)\]/u.exec(line)?.[1];
      return marker === undefined ? [] : [{ marker, line: index, endLine: index, parent: null }];
    }),
    headings: lines.flatMap((line, index) => {
      const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
      return heading === null ? [] : [{ heading: heading[2] ?? "", level: heading[1]?.length ?? 1, line: index }];
    }),
    tags: lines.flatMap((line, index) =>
      /^#{1,6}\s/u.test(line)
        ? []
        : [...line.matchAll(/(?:^|\s)(#[\w-]+)/gu)].map((tag) => ({ tag: tag[1] ?? "", line: index })),
    ),
    frontmatterTags: [],
  };
}

function dayJournal(
  name: string,
  move: Partial<JournalMoveConfig> = {},
  filter?: TaskRule,
  overrides: Partial<JournalConfig> = {},
): JournalConfig {
  return fixedJournal(
    name,
    { type: "day" },
    {
      ...overrides,
      folder: name,
      tasks: {
        providers: {},
        filter: filter ?? v.parse(taskRuleSchema, {}),
        move: v.parse(journalMoveSchema, move),
      },
    },
  );
}

async function rolloverFor(journals: Record<string, JournalConfig>) {
  const notes = new FakeNotesService();
  const structures = new FakeNoteStructureService();
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals },
    overrides: [overrideWith(NotesService, notes as never), overrideWith(NoteStructureService, structures as never)],
  });
  const index = harness.resolve(JournalsIndex);
  const put = (journalName: string, at: string, text: string): VaultPath => {
    const path = `${journalName}/${at}.md` as VaultPath;
    notes.seed(path, text);
    structures.setStructure(path, structureOf(text));
    index.register({ journalName, anchor: anchor(at), path });
    return path;
  };
  const putNotelet = (journalName: string, at: string, name: string, text: string): VaultPath => {
    const path = `${journalName}/notelets/${name}.md` as VaultPath;
    notes.seed(path, text);
    structures.setStructure(path, structureOf(text));
    index.register({ kind: "notelet", journalName, anchor: anchor(at), path, typeName: "Meeting", typeId: null });
    return path;
  };
  // Indexed, but metadataCache has not parsed it yet.
  const putUnparsed = (journalName: string, at: string, text: string): VaultPath => {
    const path = `${journalName}/${at}.md` as VaultPath;
    notes.seed(path, text);
    index.register({ journalName, anchor: anchor(at), path });
    return path;
  };
  const text = async (path: VaultPath): Promise<string> => {
    const result = await notes.read(path);
    expectOk(result);
    return result.value;
  };
  // What metadataCache does once it has parsed the writes.
  const resolveMetadata = async (): Promise<void> => {
    for (const path of notes.allMarkdownNotes()) structures.setStructure(path, structureOf(await text(path)));
  };
  // metadataCache re-parsing each note as soon as it is written.
  const followWrites = (): void => {
    notes.events.on("metadata-changed", (path) => {
      void notes.read(path).tap((content) => structures.setStructure(path, structureOf(content)));
    });
  };
  const service = harness.resolve(RolloverService);
  const roll = async (interactive = true): Promise<RollReport> => {
    const result = await service.roll("daily", { interactive });
    expectOk(result);
    return result.value;
  };
  return {
    harness,
    service,
    roll,
    putUnparsed,
    followWrites,
    tasks: harness.resolve(TaskIndex),
    checkbox: harness.resolve(SettingsService).getSlice(checkboxSlice),
    notes,
    put,
    putNotelet,
    text,
    resolveMetadata,
  };
}

function reportOf(overrides: Partial<RollReport>): RollReport {
  return {
    journalName: "daily",
    rolled: 0,
    notes: 0,
    sources: [],
    read: [],
    noPrevious: false,
    missingHeading: [],
    heading: null,
    skippedNoteItems: 0,
    skippedBlockIds: 0,
    changedSources: [],
    failedSources: [],
    skippedSources: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 21, 9, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RolloverService", () => {
  it("rolls open items from the previous existing note into today's and stamps them", async () => {
    const { roll, put, text } = await rolloverFor({ daily: dayJournal("daily"), work: dayJournal("work") });
    const source = put("daily", "2026-10-19", "# Day\n- [ ] Call Bob\n- [x] Done thing\n- [ ] Write report\n");
    const neighbor = put("work", "2026-10-20", "- [ ] Work item\n");
    const target = put("daily", TODAY, "# Today\n");

    const report = await roll();

    expect(await text(target)).toBe("# Today\n- [ ] Call Bob\n- [ ] Write report\n");
    expect(await text(source)).toBe("# Day\n- [ ] Call Bob #rolled\n- [x] Done thing\n- [ ] Write report #rolled\n");
    expect(await text(neighbor)).toBe("- [ ] Work item\n");
    expect(report).toMatchObject({ rolled: 2, notes: 1, sources: ["2026-10-19"], read: ["2026-10-19"] });
  });

  it("ignores the journal's listing status when choosing what rolls", async () => {
    const doneOnly: TaskRule = { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["done"] }] };
    const { roll, put, text } = await rolloverFor({ daily: dayJournal("daily", {}, doneOnly) });
    put("daily", "2026-10-20", "- [ ] Call Bob\n- [x] Done thing\n");
    const target = put("daily", TODAY, "");

    await roll();

    expect(await text(target)).toBe("- [ ] Call Bob\n");
  });

  it("rolls nothing while the checkbox provider is off", async () => {
    const { roll, put, text, checkbox } = await rolloverFor({ daily: dayJournal("daily") });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", TODAY, "");
    checkbox.state.enabled = false;

    const report = await roll();

    expect(await text(target)).toBe("");
    expect(await text(source)).toBe("- [ ] Call Bob\n");
    expect(rollNotice(report)).toBe(m.tasks_roll_nothing({ oldest: "2026-10-20" }));
  });

  it("reads the period note before its notelets, the notelets by path", async () => {
    const { roll, put, putNotelet, text } = await rolloverFor({ daily: dayJournal("daily", { source: "both" }) });
    put("daily", "2026-10-20", "- [ ] From day\n");
    putNotelet("daily", "2026-10-20", "b", "- [ ] From b\n");
    putNotelet("daily", "2026-10-20", "a", "- [ ] From a\n");
    const elsewhere = putNotelet("daily", "2026-10-19", "c", "- [ ] Elsewhere\n");
    const target = put("daily", TODAY, "");

    const report = await roll();

    expect(await text(target)).toBe("- [ ] From day\n- [ ] From a\n- [ ] From b\n");
    expect(await text(elsewhere)).toBe("- [ ] Elsewhere\n");
    expect(report).toMatchObject({ rolled: 3, notes: 3, sources: ["2026-10-20"] });
  });

  it("notelets as the source leave the period note alone", async () => {
    const { roll, put, putNotelet, text } = await rolloverFor({ daily: dayJournal("daily", { source: "notelets" }) });
    const day = put("daily", "2026-10-20", "- [ ] From day\n");
    putNotelet("daily", "2026-10-20", "a", "- [ ] From a\n");
    const target = put("daily", TODAY, "");

    await roll();

    expect(await text(target)).toBe("- [ ] From a\n");
    expect(await text(day)).toBe("- [ ] From day\n");
  });

  it("creates today's note when it is missing before writing", async () => {
    const { roll, put, text, notes } = await rolloverFor({ daily: dayJournal("daily") });
    put("daily", "2026-10-20", "- [ ] Call Bob\n- [x] Done thing\n");

    await roll(false);

    const target = `daily/${TODAY}.md` as VaultPath;
    expect(notes.find(target).isSome()).toBe(true);
    expect(await text(target)).toBe("- [ ] Call Bob\n");
  });

  it("look-back 2 reads two notes oldest first and a stamped line is never taken twice", async () => {
    const { roll, put, text, resolveMetadata } = await rolloverFor({ daily: dayJournal("daily", { lookBack: 2 }) });
    const tooOld = put("daily", "2026-10-17", "- [ ] Too old\n");
    put("daily", "2026-10-18", "- [ ] Old task\n");
    put("daily", "2026-10-20", "- [ ] Newer task\n- [ ] Already #rolled\n");
    const target = put("daily", TODAY, "");

    const first = await roll();
    await resolveMetadata();
    const second = await roll();

    expect(await text(target)).toBe("- [ ] Old task\n- [ ] Newer task\n");
    expect(await text(tooOld)).toBe("- [ ] Too old\n");
    expect(first).toMatchObject({ rolled: 2, notes: 2, sources: ["2026-10-18", "2026-10-20"] });
    expect(second).toMatchObject({ rolled: 0, read: ["2026-10-18", "2026-10-20"] });
  });

  it("skips a source whose metadata has not caught up with a stamp", async () => {
    const { roll, put, text } = await rolloverFor({ daily: dayJournal("daily") });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", TODAY, "");

    await roll();
    const second = await roll();

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(await text(source)).toBe("- [ ] Call Bob #rolled\n");
    expect(second).toMatchObject({ rolled: 0, read: ["2026-10-20"], skippedSources: ["2026-10-20"] });
  });

  it("reports a source still being indexed instead of calling it empty", async () => {
    const { roll, put, putUnparsed, text } = await rolloverFor({ daily: dayJournal("daily", { lookBack: 2 }) });
    put("daily", "2026-10-19", "- [x] Done thing\n");
    const unparsed = putUnparsed("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", TODAY, "");

    const report = await roll();

    expect(await text(target)).toBe("");
    expect(await text(unparsed)).toBe("- [ ] Call Bob\n");
    expect(rollNotice(report)).toBe(
      [m.tasks_roll_nothing({ oldest: "2026-10-19" }), m.tasks_roll_source_indexing({ date: "2026-10-20" })].join(" "),
    );
  });

  it("a second roll started during the first waits for it and rolls nothing", async () => {
    const { service, put, text, followWrites } = await rolloverFor({ daily: dayJournal("daily") });
    followWrites();
    put("daily", "2026-10-20", "- [ ] Call Bob\n- [x] Done thing\n");
    const target = put("daily", TODAY, "");

    const [first, second] = await Promise.all([
      service.roll("daily", { interactive: true }),
      service.roll("daily", { interactive: true }),
    ]);

    expectOk(first);
    expectOk(second);
    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(rollNotice(second.value)).toBe(m.tasks_roll_nothing({ oldest: "2026-10-20" }));
  });

  it("cancelling the creation prompt writes nothing", async () => {
    const { service, put, text, notes, harness } = await rolloverFor({
      daily: dayJournal("daily", {}, undefined, { confirmCreation: true }),
    });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");

    const pending = service.roll("daily", { interactive: true });
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    harness.modals.lastOpen<unknown, boolean>().submit(false);
    const result = await pending;

    expectErr(result);
    expect(result.error).toBeInstanceOf(UserAborted);
    expect(await text(source)).toBe("- [ ] Call Bob\n");
    expect(notes.find(`daily/${TODAY}.md` as VaultPath).isNone()).toBe(true);
  });

  it("move mode removes the subtree from the source and keeps context", async () => {
    const { roll, put, text } = await rolloverFor({ daily: dayJournal("daily", { mode: "move" }) });
    const source = put(
      "daily",
      "2026-10-20",
      "- [x] Shopping\n    - [ ] milk\n    - [x] bread\n- [ ] Call Bob\n    - ask about Friday\n- [x] Finished\n",
    );
    const target = put("daily", TODAY, "");

    await roll();

    expect(await text(target)).toBe("- [x] Shopping\n    - [ ] milk\n- [ ] Call Bob\n    - ask about Friday\n");
    expect(await text(source)).toBe("- [x] Shopping\n    - [x] bread\n- [x] Finished\n");
  });

  it("move mode leaves a subtree with a block link in place and counts it", async () => {
    const { roll, put, text } = await rolloverFor({ daily: dayJournal("daily", { mode: "move" }) });
    const source = put("daily", "2026-10-20", "- [ ] Linked ^abc\n- [ ] Call Bob\n");
    const target = put("daily", TODAY, "");

    const report = await roll();

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(await text(source)).toBe("- [ ] Linked ^abc\n");
    expect(report).toMatchObject({ rolled: 1, skippedBlockIds: 1 });
  });

  it("copy without stamping leaves the source untouched", async () => {
    const { roll, put, text, notes } = await rolloverFor({ daily: dayJournal("daily", { stamp: false }) });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n- [x] Done thing\n");
    const target = put("daily", TODAY, "");
    const before = notes.find(source).map((note) => note.mtime);

    await roll();

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(await text(source)).toBe("- [ ] Call Bob\n- [x] Done thing\n");
    expect(notes.find(source).map((note) => note.mtime)).toEqual(before);
  });

  it("writes the target before any source", async () => {
    const { roll, put, text, notes } = await rolloverFor({ daily: dayJournal("daily", { lookBack: 3 }) });
    const first = put("daily", "2026-10-18", "- [ ] One\n");
    const failing = put("daily", "2026-10-19", "- [ ] Two\n- [x] Done thing\n");
    const third = put("daily", "2026-10-20", "- [ ] Three\n");
    const target = put("daily", TODAY, "");
    const process = notes.process.bind(notes);
    vi.spyOn(notes, "process").mockImplementation((path, transform) =>
      path === failing ? AsyncResult.err(new NoteWriteError(path, "disk full")) : process(path, transform),
    );

    const report = await roll();

    expect(await text(target)).toBe("- [ ] One\n- [ ] Two\n- [ ] Three\n");
    expect(await text(first)).toBe("- [ ] One #rolled\n");
    expect(await text(failing)).toBe("- [ ] Two\n- [x] Done thing\n");
    expect(await text(third)).toBe("- [ ] Three #rolled\n");
    expect(report.failedSources).toEqual([{ path: failing, anchor: "2026-10-19" }]);
  });

  describe("a target write that fails", () => {
    it("leaves every source byte-identical when the write is refused", async () => {
      const { service, put, text, notes } = await rolloverFor({ daily: dayJournal("daily", { lookBack: 2 }) });
      const older = put("daily", "2026-10-19", "- [ ] One\n");
      const newer = put("daily", "2026-10-20", "- [ ] Two\n");
      const target = put("daily", TODAY, "# Today\n");
      const process = notes.process.bind(notes);
      vi.spyOn(notes, "process").mockImplementation((path, transform) =>
        path === target ? AsyncResult.err(new NoteWriteError(path, "disk full")) : process(path, transform),
      );

      const result = await service.roll("daily", { interactive: true });

      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteWriteError);
      expect(await text(older)).toBe("- [ ] One\n");
      expect(await text(newer)).toBe("- [ ] Two\n");
    });

    it("leaves every source byte-identical when the target vanished", async () => {
      const { service, put, text, harness } = await rolloverFor({ daily: dayJournal("daily") });
      const source = put("daily", "2026-10-20", "- [ ] One\n");
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "daily", anchor: anchor(TODAY), path: `daily/${TODAY}.md` as VaultPath });

      const result = await service.roll("daily", { interactive: true });

      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteNotFoundError);
      expect(await text(source)).toBe("- [ ] One\n");
    });
  });

  it("a source edited between read and write is reported and not rewritten", async () => {
    const { roll, put, text, notes } = await rolloverFor({ daily: dayJournal("daily", { lookBack: 2 }) });
    const edited = put("daily", "2026-10-19", "- [ ] Call Bob\n");
    const steady = put("daily", "2026-10-20", "- [ ] Write report\n");
    put("daily", TODAY, "");
    const read = notes.read.bind(notes);
    vi.spyOn(notes, "read").mockImplementation((path) => {
      const result = read(path);
      if (path === edited) notes.seed(edited, "- [ ] Inserted above\n- [ ] Call Bob\n");
      return result;
    });

    const report = await roll();

    expect(await text(edited)).toBe("- [ ] Inserted above\n- [ ] Call Bob\n");
    expect(await text(steady)).toBe("- [ ] Write report #rolled\n");
    expect(report.changedSources).toEqual([{ path: edited, anchor: "2026-10-19" }]);
  });

  it("note-property items in the source period are counted, not moved", async () => {
    const { roll, put, text, tasks } = await rolloverFor({ daily: dayJournal("daily") });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    put("daily", TODAY, "");
    tasks.publish("checkbox", { path: source }, [
      buildTaskItem({
        path: source,
        key: `${source}:0`,
        display: { kind: "line", path: source, line: 0, endLine: 0, parentLine: null, markdown: "- [ ] Call Bob" },
      }),
    ]);
    const taskNote = (path: string, status: "todo" | "done", scheduled: string) =>
      buildTaskItem({
        provider: NOTE_PROPERTY_PROVIDER_ID,
        key: `${NOTE_PROPERTY_PROVIDER_ID}:${path}`,
        path: path as VaultPath,
        status,
        relations: ["date"],
        capabilities: { movable: false, stampable: false, retargetable: true },
        display: { kind: "note", path: path as VaultPath, title: path },
        dates: { scheduled: anchor(scheduled) },
      });
    tasks.publish(NOTE_PROPERTY_PROVIDER_ID, { path: "Tasks/open.md" as VaultPath }, [
      taskNote("Tasks/open.md", "todo", "2026-10-20"),
    ]);
    tasks.publish(NOTE_PROPERTY_PROVIDER_ID, { path: "Tasks/done.md" as VaultPath }, [
      taskNote("Tasks/done.md", "done", "2026-10-20"),
    ]);
    tasks.publish(NOTE_PROPERTY_PROVIDER_ID, { path: "Tasks/later.md" as VaultPath }, [
      taskNote("Tasks/later.md", "todo", "2026-10-25"),
    ]);

    const report = await roll();

    expect(report).toMatchObject({ rolled: 1, skippedNoteItems: 1 });
    expect(await text(source)).toBe("- [ ] Call Bob #rolled\n");
  });

  it("selection naming a heading the note lacks reports it distinctly from nothing to roll", async () => {
    const underTasks: TaskRule = {
      mode: "and",
      conditions: [
        { type: "heading", condition: "under", headings: ["Tasks"] },
        { type: "status", condition: "is", statuses: ["done"] },
      ],
    };
    const { roll, put, text } = await rolloverFor({ daily: dayJournal("daily", {}, underTasks) });
    put("daily", "2026-10-20", "# Notes\n- [ ] Stray\n");
    const target = put("daily", TODAY, "");

    const report = await roll();

    expect(await text(target)).toBe("");
    expect(report).toMatchObject({ rolled: 0, missingHeading: ["2026-10-20"], heading: "Tasks" });
    expect(rollNotice(report)).toBe(m.tasks_roll_missing_heading({ heading: "Tasks", date: "2026-10-20" }));
  });

  it("reports no earlier note when the journal has none before today", async () => {
    const { roll, put, notes } = await rolloverFor({ daily: dayJournal("daily"), work: dayJournal("work") });
    put("work", "2026-10-20", "- [ ] Work item\n");

    const report = await roll();

    expect(report).toMatchObject({ noPrevious: true, read: [] });
    expect(notes.find(`daily/${TODAY}.md` as VaultPath).isNone()).toBe(true);
  });
});

describe("rollNotice", () => {
  it("rollNotice composes sentences in the fixed order", () => {
    const report = reportOf({
      rolled: 3,
      notes: 2,
      sources: [anchor("2026-10-18"), anchor("2026-10-20")],
      read: [anchor("2026-10-18"), anchor("2026-10-19"), anchor("2026-10-20")],
      missingHeading: [anchor("2026-10-19")],
      heading: "Tasks",
      skippedNoteItems: 2,
      skippedBlockIds: 1,
      changedSources: [{ path: "daily/2026-10-20.md" as VaultPath, anchor: anchor("2026-10-20") }],
      failedSources: [{ path: "daily/2026-10-18.md" as VaultPath, anchor: anchor("2026-10-18") }],
      skippedSources: [anchor("2026-10-17")],
    });

    expect(rollNotice(report)).toBe(
      [
        m.tasks_roll_done({ count: 3, notes: 2, oldest: "2026-10-18" }),
        m.tasks_roll_missing_heading({ heading: "Tasks", date: "2026-10-19" }),
        m.tasks_roll_note_items_skipped({ count: 2 }),
        m.tasks_roll_block_ids_skipped({ count: 1 }),
        m.tasks_roll_source_changed({ date: "2026-10-20" }),
        m.tasks_roll_source_write_failed({ date: "2026-10-18" }),
        m.tasks_roll_source_indexing({ date: "2026-10-17" }),
      ].join(" "),
    );
  });

  it("says nothing was rolled from the oldest note read", () => {
    const report = reportOf({ read: [anchor("2026-10-19"), anchor("2026-10-20")] });

    expect(rollNotice(report)).toBe(m.tasks_roll_nothing({ oldest: "2026-10-19" }));
  });

  it("says there is no earlier note when none exists", () => {
    expect(rollNotice(reportOf({ noPrevious: true }))).toBe(m.tasks_roll_no_previous());
  });
});
