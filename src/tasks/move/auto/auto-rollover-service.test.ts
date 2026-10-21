import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import type { Module } from "@/infrastructure/di";
import {
  AppActivity,
  NoteStructureService,
  NotesService,
  type NoteStructure,
  type VaultPath,
} from "@/infrastructure/host";
import { FakeAppActivity, FakeNoteStructureService, FakeNotesService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { expectOk } from "@/infrastructure/result/testing";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { overrideWith, testContainer } from "@/testing";

import { taskRuleSchema, type TaskRule } from "../../conditions";
import { tasksCoreModule } from "../../module";
import { NoCurrentPeriodError } from "../errors";
import { RolloverService } from "../rollover-service";
import { journalMoveSchema, type JournalMoveConfig } from "../settings";

import { AutoRolloverService } from "./auto-rollover-service";
import { MAX_WAIT_MS, QUIET_MS } from "./quiet-window";

const HOUR = 60 * 60 * 1000;

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
    await vi.advanceTimersByTimeAsync(QUIET_MS);
  };
  return {
    harness,
    notes,
    activity,
    index,
    put,
    text,
    roll,
    realRoll,
    calls,
    boot,
    service: harness.resolve(AutoRolloverService),
  };
}

const underTasks: TaskRule = {
  mode: "and",
  conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }],
};

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
    expect(harness.notices.messages).toEqual([m.tasks_roll_done({ count: 1, notes: 1, oldest: "2026-10-20" })]);
  });

  it("waits out a quiet vault before reading anything", async () => {
    const { put, text, index } = await autoFor({ daily: automatic("daily") });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");

    index.markReady();
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

  it("a note created while its period is current rolls right away", async () => {
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

  it("the midnight timer rolls into the new day", async () => {
    const { put, text, calls, boot } = await autoFor({ daily: automatic("daily"), work: dayJournal("work") });
    put("daily", "2026-10-21", "- [ ] Today item\n- [x] Done thing\n");
    const tomorrow = put("daily", "2026-10-22", "");
    await boot();
    expect(calls("daily")).toBe(1);

    await vi.advanceTimersByTimeAsync(15 * HOUR - QUIET_MS - 1);
    expect(await text(tomorrow)).toBe("");
    await vi.advanceTimersByTimeAsync(1 + QUIET_MS);

    expect(await text(tomorrow)).toBe("- [ ] Today item\n");
    expect(calls("daily")).toBe(2);
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
    await vi.advanceTimersByTimeAsync(QUIET_MS);

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
    activity.resume();
    await vi.advanceTimersByTimeAsync(QUIET_MS * 3);

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
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(calls("daily")).toBe(1);
    for (let i = 0; i < 5; i += 1) activity.resume();
    gate.resolve();
    await vi.advanceTimersByTimeAsync(QUIET_MS * 4);

    expect(calls("daily")).toBe(2);
  });

  it("a busy vault defers the roll to the next checkpoint", async () => {
    const { put, text, calls, index, activity, notes } = await autoFor({
      daily: automatic("daily"),
      work: dayJournal("work"),
    });
    put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    const syncing = put("work", "2026-10-21", "");

    index.markReady();
    for (let elapsed = 0; elapsed < MAX_WAIT_MS; elapsed += 1000) {
      notes.emitModified(syncing);
      await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(calls("daily")).toBe(0);
    expect(await text(target)).toBe("");

    activity.resume();
    await vi.advanceTimersByTimeAsync(QUIET_MS);

    expect(await text(target)).toBe("- [ ] Call Bob\n");
    expect(calls("daily")).toBe(1);
  });

  it("copy without stamping is paused with one notice per session", async () => {
    const { put, text, calls, boot, activity, harness } = await autoFor(
      { daily: automatic("daily"), work: dayJournal("work") },
      { tasksMove: { mode: "copy", stamp: false } },
    );
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    const target = put("daily", "2026-10-21", "");
    await boot();
    activity.resume();
    await vi.advanceTimersByTimeAsync(QUIET_MS);

    expect(calls("daily")).toBe(0);
    expect(await text(source)).toBe("- [ ] Call Bob\n");
    expect(await text(target)).toBe("");
    expect(harness.notices.messages).toEqual([m.tasks_auto_roll_paused({ journal: "daily" })]);
  });

  it("nothing to roll is silent", async () => {
    const { put, text, calls, boot, harness } = await autoFor({
      daily: automatic("daily"),
      fresh: automatic("fresh"),
      work: dayJournal("work"),
    });
    put("daily", "2026-10-20", "- [x] Done thing\n");
    const target = put("daily", "2026-10-21", "");
    put("fresh", "2026-10-21", "");
    put("work", "2026-10-20", "- [ ] Work item\n");
    await boot();

    expect(calls("daily")).toBe(1);
    expect(calls("fresh")).toBe(1);
    expect(await text(target)).toBe("");
    expect(harness.notices.messages).toEqual([]);
  });

  it("a missing heading is reported once per note per session", async () => {
    const { put, boot, activity, harness } = await autoFor({
      daily: automatic("daily", {}, underTasks),
      work: dayJournal("work", {}, underTasks),
    });
    put("daily", "2026-10-20", "# Notes\n- [ ] Stray\n");
    put("daily", "2026-10-21", "# Notes\n- [ ] Also stray\n");
    put("daily", "2026-10-22", "");
    put("work", "2026-10-20", "# Notes\n- [ ] Work item\n");
    put("work", "2026-10-21", "");
    await boot();
    activity.resume();
    await vi.advanceTimersByTimeAsync(QUIET_MS);

    expect(harness.notices.messages).toEqual([m.tasks_roll_missing_heading({ heading: "Tasks", date: "2026-10-20" })]);

    await vi.advanceTimersByTimeAsync(15 * HOUR);

    expect(harness.notices.messages).toEqual([
      m.tasks_roll_missing_heading({ heading: "Tasks", date: "2026-10-20" }),
      m.tasks_roll_missing_heading({ heading: "Tasks", date: "2026-10-21" }),
    ]);
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
    const { put, calls, boot, index, activity } = await autoFor({
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
    activity.resume();
    await vi.advanceTimersByTimeAsync(QUIET_MS);

    expect(calls("daily")).toBe(0);
  });

  it("no current note means no roll and no note is created", async () => {
    const { put, text, calls, boot, notes, activity } = await autoFor({
      daily: automatic("daily"),
      work: dayJournal("work"),
    });
    const source = put("daily", "2026-10-20", "- [ ] Call Bob\n");
    put("work", "2026-10-21", "");
    await boot();
    activity.resume();
    await vi.advanceTimersByTimeAsync(QUIET_MS);

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

  it("one journal failing does not stop the next", async () => {
    const { put, text, roll, boot, harness } = await autoFor({
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

    expect(await text(alphaSource)).toBe("- [ ] Alpha item\n");
    expect(await text(alphaTarget)).toBe("");
    expect(await text(betaTarget)).toBe("- [ ] Beta item\n");
    expect(harness.notices.messages).toEqual([
      m.tasks_auto_roll_prefix({
        journal: "beta",
        notice: m.tasks_roll_done({ count: 1, notes: 1, oldest: "2026-10-20" }),
      }),
    ]);
    expect(harness.logs.records.some((record) => record.level === "error")).toBe(true);
  });

  it("journal prefix only when several journals are automatic", async () => {
    const two = await autoFor({ alpha: automatic("alpha"), beta: automatic("beta"), work: dayJournal("work") });
    two.put("alpha", "2026-10-20", "- [ ] Alpha item\n");
    two.put("alpha", "2026-10-21", "");
    two.put("beta", "2026-10-21", "");
    await two.boot();
    const done = m.tasks_roll_done({ count: 1, notes: 1, oldest: "2026-10-20" });

    expect(two.harness.notices.messages).toEqual([m.tasks_auto_roll_prefix({ journal: "alpha", notice: done })]);

    const one = await autoFor({ alpha: automatic("alpha"), work: dayJournal("work") });
    one.put("alpha", "2026-10-20", "- [ ] Alpha item\n");
    one.put("alpha", "2026-10-21", "");
    one.put("work", "2026-10-20", "- [ ] Work item\n");
    one.put("work", "2026-10-21", "");
    await one.boot();

    expect(one.harness.notices.messages).toEqual([done]);
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
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    await vi.advanceTimersByTimeAsync(48 * HOUR);

    expect(calls("alpha")).toBe(1);
    expect(calls("beta")).toBe(0);
    expect(await text(betaTarget)).toBe("");
    expect(activity.subscriberCount).toBe(0);
  });
});
