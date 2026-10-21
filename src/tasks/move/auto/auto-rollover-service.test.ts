import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { formatConjunction, m } from "@/i18n";
import type { Module } from "@/infrastructure/di";
import {
  AppActivity,
  NoteStructureService,
  NotesService,
  NoteWriteError,
  WorkspaceService,
  type NoteStructure,
  type VaultPath,
} from "@/infrastructure/host";
import { FakeAppActivity, FakeNoteStructureService, FakeNotesService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { expectOk } from "@/infrastructure/result/testing";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { SettingsService } from "@/settings";
import { overrideWith, testContainer } from "@/testing";

import { taskRuleSchema, type TaskRule } from "../../conditions";
import { tasksCoreModule } from "../../module";
import { NoCurrentPeriodError } from "../errors";
import { RolloverService } from "../rollover-service";
import { journalMoveSchema, moveDefaultsSlice, type JournalMoveConfig } from "../settings";

import { AutoRolloverService, RESUME_DELAY_MS } from "./auto-rollover-service";
import { MAX_WAIT_MS, QUIET_MS, QuietWindow } from "./quiet-window";

const HOUR = 60 * 60 * 1000;
// What a boot or a return to the app waits before it reads anything in a vault with nothing to sync.
const SETTLE = RESUME_DELAY_MS + QUIET_MS;

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

const automatic = (name: string, move: Partial<JournalMoveConfig> = {}, filter?: TaskRule): JournalConfig =>
  dayJournal(name, { automatic: true, ...move }, filter);

const autoModule: Module = {
  register(c) {
    c.register(AutoRolloverService).useClass(AutoRolloverService).eager();
  },
};

async function autoFor(journals: Record<string, JournalConfig>, data: Record<string, unknown> = {}) {
  const notes = new FakeNotesService();
  const structures = new FakeNoteStructureService();
  const activity = new FakeAppActivity();
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule, autoModule],
    data: { journals, ...data },
    overrides: [
      overrideWith(NotesService, notes as never),
      overrideWith(NoteStructureService, structures as never),
      overrideWith(AppActivity, activity as never),
    ],
  });
  // metadataCache re-parsing each note as soon as it is written.
  notes.events.on("metadata-changed", (path) => {
    void notes.read(path).tap((content) => structures.setStructure(path, structureOf(content)));
  });
  const index = harness.resolve(JournalsIndex);
  const put = (journalName: string, at: string, text: string): VaultPath => {
    const path = `${journalName}/${at}.md` as VaultPath;
    notes.seed(path, text);
    structures.setStructure(path, structureOf(text));
    index.register({ journalName, anchor: anchor(at), path });
    return path;
  };
  // An edit the user makes outside any open view, read back by metadataCache.
  const edit = (path: VaultPath, text: string): void => {
    notes.seed(path, text);
    structures.setStructure(path, structureOf(text));
  };
  const text = async (path: VaultPath): Promise<string> => {
    const result = await notes.read(path);
    expectOk(result);
    return result.value;
  };
  const rollover = harness.resolve(RolloverService);
  const realRoll = rollover.roll.bind(rollover);
  const roll = vi.spyOn(rollover, "roll");
  const calls = (journalName: string): number => roll.mock.calls.filter(([name]) => name === journalName).length;
  // What the startup scan does once it has filled the index.
  const boot = async (): Promise<void> => {
    index.markReady();
    await vi.advanceTimersByTimeAsync(SETTLE);
  };
  const resume = async (): Promise<void> => {
    activity.resume();
    await vi.advanceTimersByTimeAsync(SETTLE);
  };
  return {
    harness,
    notes,
    activity,
    index,
    put,
    edit,
    text,
    roll,
    realRoll,
    calls,
    boot,
    resume,
    service: harness.resolve(AutoRolloverService),
  };
}

const underTasks: TaskRule = {
  mode: "and",
  conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }],
};

const named = (journal: string, notice: string): string => m.tasks_auto_roll_prefix({ journal, notice });
const doneFrom = (oldest: string, count = 1): string => m.tasks_roll_done({ count, notes: 1, oldest });
const missing = (date: string): string => named("daily", m.tasks_roll_missing_heading({ heading: "Tasks", date }));
const pausedUnwritten = (journal: string, dates: readonly string[]): string =>
  m.tasks_auto_roll_paused_unwritten({ journal, dates: formatConjunction(dates), count: dates.length });

// Fails every write `process` makes to one of `paths`, the way a locked or read-only file would.
function failWrites(notes: FakeNotesService, paths: Set<VaultPath>): void {
  const process = notes.process.bind(notes);
  vi.spyOn(notes, "process").mockImplementation((path, transform) =>
    paths.has(path) ? AsyncResult.err(new NoteWriteError(path, "disk full")) : process(path, transform),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 21, 9, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AutoRolloverService", () => {
  it("rolls into today's note at boot once the index is ready", async () => {
    const { put, text, roll, boot, harness } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n- [x] Done thing\n");
    const target = put("daily", "2026-10-21", "");
    const workSource = put("work", "2026-10-20", "- [ ] Work item\n");
    const workTarget = put("work", "2026-10-21", "");

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(roll).not.toHaveBeenCalled();
    await boot();

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(await text(source)).toBe("- [ ] Call Bob #rolled\n- [x] Done thing\n");
    expect(await text(workSource)).toBe("- [ ] Work item\n");
    expect(await text(workTarget)).toBe("");
    expect(roll).toHaveBeenCalledExactlyOnceWith("daily", { interactive: false, createTarget: false });
    expect(harness.notices.messages).toEqual([named("daily", doneFrom("2026-10-20"))]);
  });

  it("a boot waits out the start delay and then a quiet vault before reading anything", async () => {
    const { put, text, index } = await autoFor({ daily: automatic("daily") });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");

    index.markReady();
    await vi.advanceTimersByTimeAsync(SETTLE - 1);
    expect(await text(target)).toBe("");
    await vi.advanceTimersByTimeAsync(1);

    expect(await text(target)).toBe("- [ ] Call Bob\n");
  });

  it("the quiet window starts only once the start delay is over", async () => {
    const { put, text, index, notes } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    const syncing = put("work", "2026-10-21", "");

    index.markReady();
    await vi.advanceTimersByTimeAsync(RESUME_DELAY_MS + 2000);
    notes.emitModified(syncing);
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expect(await text(target)).toBe("");
    await vi.advanceTimersByTimeAsync(1);

    expect(await text(target)).toBe("- [ ] Call Bob\n");
  });

  it("a note created ahead of time does not roll until its period is current", async () => {
    const { put, text, calls, boot } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    put("daily", "2026-10-21", "- [ ] Plan\n");
    await boot();
    expect(calls("daily")).toBe(1);

    const friday = put("daily", "2026-10-23", "- [ ] Planned ahead\n");
    put("work", "2026-10-21", "- [ ] Work item\n");
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(calls("daily")).toBe(1);
    expect(await text(friday)).toBe("- [ ] Planned ahead\n");

    vi.setSystemTime(new Date(2026, 9, 23, 8, 0, 0));
    await vi.advanceTimersByTimeAsync(16 * HOUR + QUIET_MS);

    expect(await text(friday)).toBe("- [ ] Planned ahead\n- [ ] Plan\n- [ ] Call Bob\n");
  });

  it("a note created while its period is current rolls once the vault is quiet, with no start delay", async () => {
    const { put, text, calls, boot } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    put("daily", "2026-10-20", "- [ ] Call Bob\n- [x] Done thing\n");
    await boot();
    expect(calls("daily")).toBe(0);

    const target = put("daily", "2026-10-21", "");
    const workTarget = put("work", "2026-10-21", "");
    await vi.advanceTimersByTimeAsync(QUIET_MS);

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(await text(workTarget)).toBe("");
    expect(calls("daily")).toBe(1);
  });

  it("the midnight timer rolls into the new day once the vault is quiet, with no start delay", async () => {
    const { put, text, calls, boot } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    put("daily", "2026-10-21", "- [ ] Today item\n- [x] Done thing\n");
    const tomorrow = put("daily", "2026-10-22", "");
    await boot();
    expect(calls("daily")).toBe(1);

    await vi.advanceTimersByTimeAsync(15 * HOUR - SETTLE - 1);
    expect(await text(tomorrow)).toBe("");
    await vi.advanceTimersByTimeAsync(1 + QUIET_MS);

    expect(await text(tomorrow)).toBe("- [ ] Today item\n");
    expect(calls("daily")).toBe(2);
  });

  it("a return to the app while the midnight wait is under way still waits out the start delay", async () => {
    const { put, text, boot, activity } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    put("daily", "2026-10-21", "- [ ] Today item\n");
    const tomorrow = put("daily", "2026-10-22", "");
    await boot();

    await vi.advanceTimersByTimeAsync(15 * HOUR - SETTLE + 1000);
    activity.resume();
    // The midnight wait's own quiet, then the delay the return asked for, then quiet again.
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1000 + SETTLE - 1);
    expect(await text(tomorrow)).toBe("");
    await vi.advanceTimersByTimeAsync(1);

    expect(await text(tomorrow)).toBe("- [ ] Today item\n");
  });

  it("waking after midnight rolls into the new day once", async () => {
    const { put, text, calls, boot, activity } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    put("daily", "2026-10-20", "- [x] Done thing\n");
    const today = put("daily", "2026-10-21", "- [ ] Today item\n");
    const tomorrow = put("daily", "2026-10-22", "");
    await boot();
    expect(await text(tomorrow)).toBe("");
    expect(calls("daily")).toBe(1);

    // Asleep across midnight: the clock moved on, the timer did not.
    vi.setSystemTime(new Date(2026, 9, 22, 7, 0, 0));
    activity.resume();
    activity.resume();
    await vi.advanceTimersByTimeAsync(SETTLE);

    expect(await text(tomorrow)).toBe("- [ ] Today item\n");
    expect(await text(today)).toBe("- [ ] Today item #rolled\n");
    expect(calls("daily")).toBe(2);

    // Past the moment the timer armed before the sleep would have fired.
    await vi.advanceTimersByTimeAsync(16 * HOUR);
    expect(calls("daily")).toBe(2);
  });

  it("boot then focus produces one roll", async () => {
    const { put, text, calls, index, activity, harness } = await autoFor({
      daily: automatic("daily"),
      work: dayJournal("work"),
    });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");

    index.markReady();
    await vi.advanceTimersByTimeAsync(0);
    activity.resume();
    await vi.advanceTimersByTimeAsync(RESUME_DELAY_MS);
    activity.resume();
    await vi.advanceTimersByTimeAsync(SETTLE * 3);

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(calls("daily")).toBe(1);
    expect(harness.notices.messages).toHaveLength(1);
  });

  it("a burst of checkpoints during a roll runs once more after it", async () => {
    const { put, calls, index, activity, roll, realRoll } = await autoFor({
      daily: automatic("daily"),
      work: dayJournal("work"),
    });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    put("daily", "2026-10-21", "");
    const gate = Promise.withResolvers<void>();
    roll.mockImplementationOnce((name, options) =>
      AsyncResult.fromPromise(gate.promise, () => new NoCurrentPeriodError(name)).flatMap(() =>
        realRoll(name, options),
      ),
    );

    index.markReady();
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(calls("daily")).toBe(1);
    for (let i = 0; i < 5; i += 1) activity.resume();
    gate.resolve();
    await vi.advanceTimersByTimeAsync(SETTLE * 4);

    expect(calls("daily")).toBe(2);
  });

  it("a vault still busy at the ceiling waits for quiet again, reading nothing meanwhile", async () => {
    const { put, text, calls, index, notes } = await autoFor({
      daily: automatic("daily"),
      work: dayJournal("work"),
    });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    const syncing = put("work", "2026-10-21", "");

    index.markReady();
    await vi.advanceTimersByTimeAsync(RESUME_DELAY_MS);
    for (let elapsed = 0; elapsed < MAX_WAIT_MS + 10_000; elapsed += 1000) {
      notes.emitModified(syncing);
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(calls("daily")).toBe(0);
    expect(await text(target)).toBe("");

    await vi.advanceTimersByTimeAsync(QUIET_MS);

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(calls("daily")).toBe(1);
    expect(await text(syncing)).toBe("");
  });

  it("with no journal automatic, a checkpoint waits for nothing and arms only the midnight timer", async () => {
    const { put, calls, boot, resume, harness } = await autoFor({ work: dayJournal("work") });
    put("work", "2026-10-20", "- [ ] Work item\n");
    put("work", "2026-10-21", "");
    const wait = vi.spyOn(harness.resolve(QuietWindow), "wait");
    await boot();
    await resume();

    expect(wait).not.toHaveBeenCalled();
    expect(calls("work")).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("copy without stamping is paused with one notice per session", async () => {
    const { put, text, calls, boot, resume, harness } = await autoFor(
      { daily: automatic("daily"), work: dayJournal("work") },
      { tasksMove: { mode: "copy", stamp: false } },
    );
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    await boot();
    await resume();

    expect(calls("daily")).toBe(0);
    expect(await text(source)).toBe("- [ ] Call Bob\n");
    expect(await text(target)).toBe("");
    expect(harness.notices.messages).toEqual([m.tasks_auto_roll_paused({ journal: "daily" })]);
  });

  it("a block that lifts and returns is announced again", async () => {
    const { put, edit, text, boot, resume, harness } = await autoFor(
      { daily: automatic("daily"), work: automatic("work", { mode: "move" }) },
      { tasksMove: { mode: "copy", stamp: false } },
    );
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    put("work", "2026-10-21", "");
    const defaults = harness.resolve(SettingsService).getSlice(moveDefaultsSlice);
    await boot();
    expect(await text(target)).toBe("");

    defaults.state = { mode: "copy", stamp: true };
    await resume();
    expect(await text(target)).toBe("- [ ] Call Bob\n");
    defaults.state = { mode: "copy", stamp: false };
    edit(source, "- [ ] Call Bob #rolled\n- [ ] Later item\n");
    await resume();

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    const paused = m.tasks_auto_roll_paused({ journal: "daily" });
    expect(harness.notices.messages).toEqual([paused, named("daily", doneFrom("2026-10-20")), paused]);
  });

  it("a missing heading is reported once per note per session", async () => {
    const { put, boot, resume, harness } = await autoFor({
      daily: automatic("daily", {}, underTasks),
      work: dayJournal("work", {}, underTasks),
    });
    put("daily", "2026-10-20", "# Notes\n- [ ] Stray\n");
    put("daily", "2026-10-21", "# Notes\n- [ ] Also stray\n");
    put("daily", "2026-10-22", "");
    put("work", "2026-10-20", "# Notes\n- [ ] Work item\n");
    put("work", "2026-10-21", "");
    await boot();
    await resume();

    expect(harness.notices.messages).toEqual([missing("2026-10-20")]);

    await vi.advanceTimersByTimeAsync(15 * HOUR);

    expect(harness.notices.messages).toEqual([missing("2026-10-20"), missing("2026-10-21")]);
  });

  it("a source that cannot be updated pauses its journal after one copy", async () => {
    const { put, text, calls, boot, resume, notes, harness } = await autoFor({
      daily: automatic("daily"),
      work: automatic("work"),
    });
    const failing = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    const workTarget = put("work", "2026-10-21", "");
    failWrites(notes, new Set([failing]));
    await boot();
    put("work", "2026-10-20", "- [ ] Work item\n");
    await resume();
    await resume();

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(await text(failing)).toBe("- [ ] Call Bob\n");
    expect(calls("daily")).toBe(1);
    expect(await text(workTarget)).toBe("- [ ] Work item\n");
    expect(harness.notices.messages).toEqual([
      named("daily", doneFrom("2026-10-20")),
      pausedUnwritten("daily", ["2026-10-20"]),
      named("work", doneFrom("2026-10-20")),
    ]);
  });

  it("the pause names every earlier note that could not be updated", async () => {
    const { put, boot, notes, harness } = await autoFor({
      daily: automatic("daily", { lookBack: 3 }),
      work: dayJournal("work"),
    });
    const older = put("daily", "2026-10-18", "- [ ] Older item\n");
    put("daily", "2026-10-19", "- [x] Done thing\n");
    const newer = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    put("daily", "2026-10-21", "");
    failWrites(notes, new Set([older, newer]));
    await boot();

    expect(harness.notices.messages).toEqual([
      named("daily", m.tasks_roll_done({ count: 2, notes: 2, oldest: "2026-10-18" })),
      pausedUnwritten("daily", ["2026-10-18", "2026-10-20"]),
    ]);
  });

  it("a source that changed while rolling pauses its journal too", async () => {
    const { put, edit, text, calls, boot, resume, notes, harness } = await autoFor({
      daily: automatic("daily"),
      work: automatic("work"),
    });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    put("work", "2026-10-21", "");
    const process = notes.process.bind(notes);
    // Typed between the plan and the write, so the write no longer finds the line it planned.
    let typed = false;
    vi.spyOn(notes, "process").mockImplementation((path, transform) => {
      if (path === source && !typed) {
        typed = true;
        edit(source, "- [ ] Call Bob, edited\n");
      }
      return process(path, transform);
    });
    await boot();
    put("work", "2026-10-20", "- [ ] Work item\n");
    await resume();

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(await text(source)).toBe("- [ ] Call Bob, edited\n");
    expect(calls("daily")).toBe(1);
    expect(calls("work")).toBe(2);
    expect(harness.notices.messages).toEqual([
      named("daily", doneFrom("2026-10-20")),
      pausedUnwritten("daily", ["2026-10-20"]),
      named("work", doneFrom("2026-10-20")),
    ]);
  });

  it("a target that cannot be saved pauses its journal after one copy", async () => {
    const { put, calls, boot, resume, harness } = await autoFor({
      daily: automatic("daily"),
      work: automatic("work"),
    });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    put("work", "2026-10-21", "");
    const editor = harness.host.openEditor(target, "");
    const workspace = harness.resolve(WorkspaceService);
    const save = workspace.saveOpenNote.bind(workspace);
    vi.spyOn(workspace, "saveOpenNote").mockImplementation((path) =>
      path === target ? AsyncResult.err(new NoteWriteError(path, "disk full")) : save(path),
    );
    await boot();
    put("work", "2026-10-20", "- [ ] Work item\n");
    await resume();

    expect(editor.text.match(/Call Bob/gu)).toHaveLength(1);
    expect(calls("daily")).toBe(1);
    expect(calls("work")).toBe(2);
    expect(harness.notices.messages).toEqual([
      m.tasks_auto_roll_paused_error({ journal: "daily" }),
      named("work", doneFrom("2026-10-20")),
    ]);
  });

  it("a clean roll by hand lifts that journal's pause, and only that journal's", async () => {
    const { put, edit, text, calls, boot, resume, notes, realRoll } = await autoFor({
      daily: automatic("daily"),
      work: automatic("work"),
    });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    const workSource = put("work", "2026-10-20", "- [ ] Work item\n");
    const workTarget = put("work", "2026-10-21", "");
    const failing = new Set([source, workSource]);
    failWrites(notes, failing);
    await boot();
    expect(calls("daily")).toBe(1);
    expect(calls("work")).toBe(1);

    failing.delete(source);
    edit(source, "- [ ] Call Bob #rolled\n");
    expectOk(await realRoll("daily", { interactive: true }));
    expectOk(await realRoll("work", { interactive: true }));
    edit(source, "- [ ] Call Bob #rolled\n- [ ] Later item\n");
    edit(workSource, "- [ ] Work item\n- [ ] Later work\n");
    await resume();

    expect(await text(target)).toBe("- [ ] Call Bob\n- [ ] Later item\n");
    expect(await text(workTarget)).toBe("- [ ] Work item\n- [ ] Work item\n");
    expect(calls("daily")).toBe(2);
    expect(calls("work")).toBe(1);
  });

  it("a block link that stays put is announced once per note as the look-back moves on", async () => {
    const { put, text, boot, harness } = await autoFor({
      daily: automatic("daily", { mode: "move", lookBack: 2 }),
      work: dayJournal("work"),
    });
    put("daily", "2026-10-20", "- [ ] Linked ^abc\n- [ ] Call Bob\n");
    put("daily", "2026-10-21", "");
    const tomorrow = put("daily", "2026-10-22", "");
    put("work", "2026-10-20", "- [ ] Linked ^def\n");
    await boot();
    await vi.advanceTimersByTimeAsync(15 * HOUR);

    expect(await text(tomorrow)).toBe("- [ ] Call Bob\n");
    expect(harness.notices.messages).toEqual([
      named("daily", [doneFrom("2026-10-20"), m.tasks_roll_block_ids_skipped({ count: 1 })].join(" ")),
      named("daily", doneFrom("2026-10-21")),
    ]);
  });

  it("an earlier note still indexing is said in the automatic wording", async () => {
    const { put, boot, harness } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    put("daily", "2026-10-21", "");
    harness.host.openEditor(source, "- [ ] Call Bob\n- [ ] Typed, not saved\n");
    await boot();

    expect(harness.notices.messages).toEqual([
      named("daily", m.tasks_auto_roll_source_indexing({ date: "2026-10-20" })),
    ]);
  });

  it("a period ending between the check and the roll is logged, not reported", async () => {
    const { put, roll, boot, harness } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    put("daily", "2026-10-21", "");
    roll.mockImplementationOnce((name) => AsyncResult.err(new NoCurrentPeriodError(name)));
    await boot();

    expect(harness.notices.messages).toEqual([]);
    expect(harness.logs.records.filter((record) => record.level === "error")).toEqual([]);
  });

  it("a run that throws leaves the next checkpoint working", async () => {
    const { put, text, boot, resume, harness } = await autoFor({
      daily: automatic("daily"),
      work: dayJournal("work"),
    });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    vi.spyOn(harness.resolve(QuietWindow), "wait").mockRejectedValueOnce(new Error("boom"));
    await boot();
    expect(await text(target)).toBe("");
    expect(harness.logs.records.some((record) => record.level === "error")).toBe(true);

    await resume();

    expect(await text(target)).toBe("- [ ] Call Bob\n");
  });

  it("the boot create-replay does not trigger", async () => {
    const { put, text, calls, boot, harness } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    await boot();

    harness.host.workspace.layoutReady = false;
    const target = put("daily", "2026-10-21", "");
    put("work", "2026-10-21", "");
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    expect(calls("daily")).toBe(0);
    expect(await text(target)).toBe("");
  });

  it("a settings preview standing in for today's note rolls nothing", async () => {
    const { put, calls, boot, resume, index } = await autoFor({
      daily: automatic("daily"),
      work: dayJournal("work"),
    });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    put("work", "2026-10-21", "");
    await boot();

    index.register(
      { journalName: "daily", anchor: anchor("2026-10-21"), path: "@journal-code-block-preview@1" as VaultPath },
      "preview",
    );
    await resume();

    expect(calls("daily")).toBe(0);
  });

  it("no current note means no roll and no note is created", async () => {
    const { put, text, calls, boot, resume, notes } = await autoFor({
      daily: automatic("daily"),
      work: dayJournal("work"),
    });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    put("work", "2026-10-21", "");
    await boot();
    await resume();

    expect(calls("daily")).toBe(0);
    expect(notes.find("daily/2026-10-21.md" as VaultPath).isNone()).toBe(true);
    expect(await text(source)).toBe("- [ ] Call Bob\n");
  });

  it("a journal outside its timeline does not roll", async () => {
    const ended = dayJournal("ended", { automatic: true }, undefined, {
      timeline: { start: anchor("2026-01-01"), end: { kind: "date", date: anchor("2026-01-31") } },
    });
    const { put, calls, boot } = await autoFor({ ended, daily: automatic("daily") });
    put("ended", "2026-10-20", "- [ ] Call Bob\n");
    put("ended", "2026-10-21", "");
    put("daily", "2026-10-21", "");
    await boot();

    expect(calls("ended")).toBe(0);
    expect(calls("daily")).toBe(1);
  });

  it("one journal throwing pauses it and does not stop the next", async () => {
    const { put, text, roll, boot, resume, calls, harness } = await autoFor({
      alpha: automatic("alpha"),
      beta: automatic("beta"),
      work: dayJournal("work"),
    });
    const alphaSource = put("alpha", "2026-10-20", "- [ ] Alpha item\n");
    const alphaTarget = put("alpha", "2026-10-21", "");
    put("beta", "2026-10-20", "- [ ] Beta item\n");
    const betaTarget = put("beta", "2026-10-21", "");
    roll.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await boot();
    await resume();

    expect(await text(alphaSource)).toBe("- [ ] Alpha item\n");
    expect(await text(alphaTarget)).toBe("");
    expect(await text(betaTarget)).toBe("- [ ] Beta item\n");
    expect(calls("alpha")).toBe(1);
    expect(calls("beta")).toBe(2);
    expect(harness.notices.messages).toEqual([
      m.tasks_auto_roll_paused_error({ journal: "alpha" }),
      named("beta", doneFrom("2026-10-20")),
    ]);
    expect(harness.logs.records.some((record) => record.level === "error")).toBe(true);
  });

  it("names the journal even when it is the only automatic one", async () => {
    const { put, boot, harness } = await autoFor({ alpha: automatic("alpha"), work: dayJournal("work") });
    put("alpha", "2026-10-20", "- [ ] Alpha item\n");
    put("alpha", "2026-10-21", "");
    put("work", "2026-10-20", "- [ ] Work item\n");
    put("work", "2026-10-21", "");
    await boot();

    expect(harness.notices.messages).toEqual([named("alpha", doneFrom("2026-10-20"))]);
  });

  it("unloading stops the timer and a run before its next journal", async () => {
    const { put, text, roll, realRoll, calls, index, service, activity } = await autoFor({
      alpha: automatic("alpha"),
      beta: automatic("beta"),
      work: dayJournal("work"),
    });
    put("alpha", "2026-10-20", "- [ ] Alpha item\n");
    put("alpha", "2026-10-21", "");
    put("beta", "2026-10-20", "- [ ] Beta item\n");
    const betaTarget = put("beta", "2026-10-21", "");
    put("beta", "2026-10-22", "");
    roll.mockImplementationOnce((name, options) => {
      service[Symbol.dispose]();
      return realRoll(name, options);
    });

    index.markReady();
    await vi.advanceTimersByTimeAsync(SETTLE);
    await vi.advanceTimersByTimeAsync(48 * HOUR);

    expect(calls("alpha")).toBe(1);
    expect(calls("beta")).toBe(0);
    expect(await text(betaTarget)).toBe("");
    expect(activity.subscriberCount).toBe(0);
  });

  it("unloading during the start delay reads nothing and leaves no timer", async () => {
    const { put, calls, index, service } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    put("daily", "2026-10-21", "");

    index.markReady();
    await vi.advanceTimersByTimeAsync(1000);
    service[Symbol.dispose]();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(SETTLE);

    expect(calls("daily")).toBe(0);
  });
});
