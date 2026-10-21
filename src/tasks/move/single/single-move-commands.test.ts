import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import type { Module } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsIndex } from "@/journals";
import { JournalNotFoundError, NoJournalsError, OutOfTimelineError } from "@/journals/errors";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { tasksCoreModule } from "../../module";
import { SingleMoveRefusedError } from "../errors";

import { MoveTargetPicker } from "./pick-target";
import { SingleMoveCommands } from "./single-move-commands";
import { SingleMoveService, type SingleMoveReport } from "./single-move-service";

import type { MoveTarget } from "./containing";

const CONTAINING = "move-task-to-containing-period";
const PERIOD_NOTE = "move-task-to-period-note";
const DAY = "daily/2026-10-21.md" as VaultPath;
const NOTELET = "daily/Standup.md" as VaultPath;
const ORPHAN = "notes/orphan.md" as VaultPath;
const OCTOBER = "monthly/2026-10-01.md" as VaultPath;
const TEXT = "- [ ] Call Bob\n";

const commandsModule: Module = {
  register(c) {
    c.register(SingleMoveCommands).useClass(SingleMoveCommands).eager();
  },
};

const PICKED: MoveTarget = {
  journalName: "monthly",
  anchor: anchor("2026-10-01"),
  path: OCTOBER,
  label: "October 2026",
};

function report(overrides: Partial<SingleMoveReport> = {}): SingleMoveReport {
  return { mode: "copy", label: "October 2026", outcome: "done", ...overrides };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("SingleMoveCommands", () => {
  let harness: TestHarness;
  const move = vi.fn();

  async function boot(journals: Record<string, ReturnType<typeof fixedJournal>>): Promise<void> {
    harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, commandsModule],
      data: { journals },
      allow: { hostState: true },
      overrides: [overrideWith(SingleMoveService, { move } as never)],
    });
    const index = harness.resolve(JournalsIndex);
    if ("daily" in journals) index.register({ journalName: "daily", anchor: anchor("2026-10-21"), path: DAY });
    if ("monthly" in journals) index.register({ journalName: "monthly", anchor: anchor("2026-10-01"), path: OCTOBER });
    if ("daily" in journals) {
      index.register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-10-21"),
        path: NOTELET,
        typeName: "Standup",
        typeId: null,
      });
    }
  }

  function run(id: string): void {
    harness.host.commands.get(id)?.checkCallback?.(false);
  }

  async function noticeFor(outcome: AsyncResult<SingleMoveReport, unknown>): Promise<readonly string[]> {
    move.mockReturnValue(outcome);
    harness.host.openEditor(DAY, TEXT, 0);
    run(CONTAINING);
    await vi.waitFor(() => expect(move).toHaveBeenCalled());
    await settle();
    return harness.notices.messages;
  }

  beforeEach(async () => {
    move.mockReset();
    move.mockReturnValue(AsyncResult.ok(report()));
    await boot({ daily: fixedJournal("daily", { type: "day" }), monthly: fixedJournal("monthly", { type: "month" }) });
  });

  it("both commands are listed only while an editor is active", () => {
    for (const id of [CONTAINING, PERIOD_NOTE]) {
      expect(harness.host.commands.get(id)?.checkCallback?.(true)).toBe(false);
    }
    harness.host.openEditor(DAY, TEXT, 0);
    for (const id of [CONTAINING, PERIOD_NOTE]) {
      expect(harness.host.commands.get(id)?.checkCallback?.(true)).toBe(true);
    }
  });

  it("without an editor both commands say where to put the cursor", async () => {
    run(CONTAINING);
    run(PERIOD_NOTE);
    await settle();
    expect(harness.notices.messages).toEqual([m.tasks_move_needs_editor(), m.tasks_move_needs_editor()]);
    expect(move).not.toHaveBeenCalled();
  });

  describe("move task to the containing period", () => {
    it("moves into the one containing period note and reports it", async () => {
      const editor = harness.host.openEditor(DAY, TEXT, 0);
      run(CONTAINING);
      await vi.waitFor(() =>
        expect(harness.notices.messages).toEqual([m.tasks_move_done({ mode: "copy", target: "October 2026" })]),
      );
      expect(move).toHaveBeenCalledWith({ path: DAY, content: editor.text, cursorLine: 0 }, PICKED);
      expect(harness.suggests.opens.length).toBe(0);
    });

    it("a notelet source resolves to its journal for containing", async () => {
      harness.host.openEditor(NOTELET, TEXT, 0);
      run(CONTAINING);
      await vi.waitFor(() => expect(move).toHaveBeenCalledWith(expect.objectContaining({ path: NOTELET }), PICKED));
    });

    it("refuses a note that is not part of a journal", async () => {
      harness.host.openEditor(ORPHAN, TEXT, 0);
      run(CONTAINING);
      await settle();
      expect(harness.notices.messages).toEqual([m.tasks_move_not_journal_note()]);
      expect(move).not.toHaveBeenCalled();
    });

    it("says so when no coarser journal contains the note's period", async () => {
      await boot({ daily: fixedJournal("daily", { type: "day" }) });
      harness.host.openEditor(DAY, TEXT, 0);
      run(CONTAINING);
      await settle();
      expect(harness.notices.messages).toEqual([m.tasks_move_no_containing()]);
      expect(move).not.toHaveBeenCalled();
    });

    it("cancel at the picker shows nothing", async () => {
      await boot({
        daily: fixedJournal("daily", { type: "day" }),
        monthly: fixedJournal("monthly", { type: "month" }),
        yearly: fixedJournal("yearly", { type: "year" }),
      });
      harness.host.openEditor(DAY, TEXT, 0);
      run(CONTAINING);
      await vi.waitFor(() => expect(harness.suggests.opens.length).toBe(1));
      harness.suggests.lastOpen<readonly MoveTarget[], MoveTarget>().cancel();
      await settle();
      expect(move).not.toHaveBeenCalled();
      expect(harness.notices.messages).toEqual([]);
    });
  });

  describe("move task to a period's note", () => {
    it("moves into the picked note and reports it", async () => {
      const pick = vi
        .spyOn(harness.resolve(MoveTargetPicker), "pickPeriodTarget")
        .mockReturnValue(AsyncResult.ok(PICKED));
      harness.host.openEditor(ORPHAN, TEXT, 0);
      run(PERIOD_NOTE);
      await vi.waitFor(() =>
        expect(harness.notices.messages).toEqual([m.tasks_move_done({ mode: "copy", target: "October 2026" })]),
      );
      expect(pick).toHaveBeenCalled();
      expect(move).toHaveBeenCalledWith(expect.objectContaining({ path: ORPHAN }), PICKED);
    });

    it("cancel at the picker shows nothing", async () => {
      vi.spyOn(harness.resolve(MoveTargetPicker), "pickPeriodTarget").mockReturnValue(
        AsyncResult.err(new UserAborted("move-task")),
      );
      harness.host.openEditor(DAY, TEXT, 0);
      run(PERIOD_NOTE);
      await settle();
      expect(move).not.toHaveBeenCalled();
      expect(harness.notices.messages).toEqual([]);
    });

    it.each([
      ["no journals", new NoJournalsError(), () => m.common_no_journals_yet()],
      [
        "a date outside the timeline",
        new OutOfTimelineError("daily", anchor("2030-01-01")),
        () => m.tasks_move_out_of_timeline(),
      ],
    ])("explains %s", async (_, error, notice) => {
      vi.spyOn(harness.resolve(MoveTargetPicker), "pickPeriodTarget").mockReturnValue(AsyncResult.err(error));
      harness.host.openEditor(DAY, TEXT, 0);
      run(PERIOD_NOTE);
      await vi.waitFor(() => expect(harness.notices.messages).toEqual([notice()]));
      expect(move).not.toHaveBeenCalled();
    });

    it("logs a journal that went missing and reports a failed move", async () => {
      vi.spyOn(harness.resolve(MoveTargetPicker), "pickPeriodTarget").mockReturnValue(
        AsyncResult.err(new JournalNotFoundError("gone")),
      );
      harness.host.openEditor(DAY, TEXT, 0);
      run(PERIOD_NOTE);
      await vi.waitFor(() => expect(harness.notices.messages).toEqual([m.tasks_move_failed()]));
      expect(harness.logs.records.some((record) => record.level === "error" && record.name.includes("move-task"))).toBe(
        true,
      );
    });
  });

  describe("the report", () => {
    it("names a moved task's target", async () => {
      expect(await noticeFor(AsyncResult.ok(report({ mode: "move" })))).toEqual([
        m.tasks_move_done({ mode: "move", target: "October 2026" }),
      ]);
    });

    it("names a notelet target after its period", async () => {
      const messages = await noticeFor(AsyncResult.ok(report({ noteletTitle: "Standup" })));
      expect(messages).toEqual([
        m.tasks_move_done({
          mode: "copy",
          target: m.tasks_move_target_row({
            label: "October 2026",
            journal: "",
            notelet: "Standup",
            hasJournal: "no",
            hasNotelet: "yes",
          }),
        }),
      ]);
      expect(messages).toEqual(["Copied the task to October 2026 · Standup."]);
    });

    it("a task that had already left says so", async () => {
      expect(await noticeFor(AsyncResult.ok(report({ outcome: "nothing" })))).toEqual([m.tasks_move_nothing()]);
    });

    it("a source that could not be read names the note", async () => {
      expect(await noticeFor(AsyncResult.ok(report({ outcome: "unread" })))).toEqual([
        m.tasks_move_source_unread({ noteName: "2026-10-21" }),
      ]);
    });

    it.each(["copy", "move"] as const)("a source that changed names the note, in %s mode", async (mode) => {
      expect(await noticeFor(AsyncResult.ok(report({ mode, outcome: "changed" })))).toEqual([
        m.tasks_move_source_changed({ noteName: "2026-10-21", mode }),
      ]);
    });

    it.each(["copy", "move"] as const)("a source write that failed names the note, in %s mode", async (mode) => {
      expect(await noticeFor(AsyncResult.ok(report({ mode, outcome: "write-failed" })))).toEqual([
        m.tasks_move_source_write_failed({ noteName: "2026-10-21", mode }),
      ]);
    });

    it.each([
      ["not-a-task", () => m.tasks_move_not_a_task()],
      ["rolled", () => m.tasks_move_already_rolled()],
      ["same-note", () => m.tasks_move_same_note()],
    ] as const)("explains a %s refusal", async (reason, notice) => {
      expect(await noticeFor(AsyncResult.err(new SingleMoveRefusedError(reason)))).toEqual([notice()]);
    });

    it("an aborted move, such as a cancelled block-link confirm, shows nothing", async () => {
      expect(await noticeFor(AsyncResult.err(new UserAborted("move-task")))).toEqual([]);
    });

    it("any other failure is logged and reported as a failed move", async () => {
      expect(await noticeFor(AsyncResult.err(new Error("boom")))).toEqual([m.tasks_move_failed()]);
      expect(harness.logs.records.some((record) => record.level === "error")).toBe(true);
    });
  });
});
