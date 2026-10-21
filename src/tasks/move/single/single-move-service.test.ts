import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";

import type { PeriodKind } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { UserAborted } from "@/infrastructure/flows";
import {
  NotesService,
  NoteWriteError,
  WorkspaceService,
  type ActiveEditorState,
  type VaultPath,
} from "@/infrastructure/host";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { overrideWith, testContainer } from "@/testing";

import { taskRuleSchema } from "../../conditions";
import { tasksCoreModule } from "../../module";
import { SingleMoveRefusedError } from "../errors";
import { journalMoveSchema, type JournalMoveConfig } from "../settings";
import { confirmBlockLinkModal } from "../ui/modals";

import { SingleMoveService } from "./single-move-service";

import type { MoveTarget } from "./containing";

const SOURCE = "daily/2026-10-20.md" as VaultPath;
const LABEL = "October 2026";

function journal(
  name: string,
  type: Exclude<PeriodKind, "decade">,
  move: Partial<JournalMoveConfig> = {},
): JournalConfig {
  return fixedJournal(
    name,
    { type },
    {
      folder: name,
      tasks: { providers: {}, filter: v.parse(taskRuleSchema, {}), move: v.parse(journalMoveSchema, move) },
    },
  );
}

function target(journalName: string, at: string, path: VaultPath | null): MoveTarget {
  return { journalName, anchor: anchor(at), path, label: LABEL };
}

async function moverFor(journals: Record<string, JournalConfig>) {
  const notes = new FakeNotesService();
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals },
    overrides: [overrideWith(NotesService, notes as never)],
  });
  const index = harness.resolve(JournalsIndex);
  const put = (journalName: string, at: string, text: string): VaultPath => {
    const path = `${journalName}/${at}.md` as VaultPath;
    notes.seed(path, text);
    index.register({ journalName, anchor: anchor(at), path });
    return path;
  };
  // The note on disk holds what was last saved; the editor holds the same text until a test types.
  const edit = (text: string, cursorLine: number) => {
    notes.seed(SOURCE, text);
    const editor = harness.host.openEditor(SOURCE, text, cursorLine);
    const state = harness.resolve(WorkspaceService).activeEditorState().getOrUndefined();
    if (state === undefined) throw new Error("no active editor");
    return { editor, state };
  };
  const text = async (path: VaultPath): Promise<string> => {
    const result = await notes.read(path);
    expectOk(result);
    return result.value;
  };
  const service = harness.resolve(SingleMoveService);
  const move = (source: ActiveEditorState, to: MoveTarget) => service.move(source, to);
  return { harness, notes, index, put, edit, text, service, move };
}

describe("SingleMoveService", () => {
  it("moves the subtree to the target and removes it from the editor buffer", async () => {
    const { put, edit, text, move } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month", { mode: "move" }),
    });
    const month = put("monthly", "2026-10-01", "# October\n");
    const other = put("monthly", "2026-09-01", "# September\n");
    const saved = "# Day\n- [ ] Call Bob\n    - ask about Friday\n- [ ] Other\n";
    const { editor, state } = edit(saved, 1);

    const result = await move(state, target("monthly", "2026-10-01", month));

    expectOk(result);
    expect(result.value).toEqual({ mode: "move", label: LABEL, outcome: "done" });
    expect(await text(month)).toBe("# October\n- [ ] Call Bob\n    - ask about Friday\n");
    expect(await text(other)).toBe("# September\n");
    expect(editor.text).toBe("# Day\n- [ ] Other\n");
    expect(await text(SOURCE)).toBe(saved);
  });

  it("copy stamps the source line in the editor", async () => {
    const { put, edit, text, move } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month"),
    });
    const month = put("monthly", "2026-10-01", "");
    const { editor, state } = edit("- [ ] Call Bob ^bob\n    - detail\n- [ ] Other\n", 0);

    const result = await move(state, target("monthly", "2026-10-01", month));

    expectOk(result);
    expect(result.value).toEqual({ mode: "copy", label: LABEL, outcome: "done" });
    expect(await text(month)).toBe("- [ ] Call Bob\n    - detail\n");
    expect(editor.text).toBe("- [ ] Call Bob #rolled ^bob\n    - detail\n- [ ] Other\n");
  });

  it("a line typed above the task before the write refuses the source edit and reports it", async () => {
    const { put, edit, text, move, notes } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month", { mode: "move" }),
    });
    const month = put("monthly", "2026-10-01", "");
    const { editor, state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);
    const process = notes.process.bind(notes);
    vi.spyOn(notes, "process").mockImplementation((path, transform) => {
      editor.text = `- [ ] Typed meanwhile\n${editor.text}`;
      return process(path, transform);
    });

    const result = await move(state, target("monthly", "2026-10-01", month));

    expectOk(result);
    expect(result.value).toEqual({ mode: "move", label: LABEL, outcome: "changed" });
    expect(await text(month)).toBe("- [ ] Call Bob\n");
    expect(editor.text).toBe("- [ ] Typed meanwhile\n- [ ] Call Bob\n- [ ] Other\n");
    expect(editor.changes).toEqual([]);
  });

  it("the target is written before the source", async () => {
    const { put, edit, move, notes } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month", { mode: "move" }),
    });
    const month = put("monthly", "2026-10-01", "");
    const { editor, state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);
    const editsBeforeTarget: number[] = [];
    const process = notes.process.bind(notes);
    vi.spyOn(notes, "process").mockImplementation((path, transform) => {
      editsBeforeTarget.push(editor.changes.length);
      return process(path, transform);
    });

    expectOk(await move(state, target("monthly", "2026-10-01", month)));

    expect(editsBeforeTarget).toEqual([0]);
    expect(editor.changes).toHaveLength(1);
  });

  it("a failed target write leaves the source untouched", async () => {
    const { put, edit, move, notes } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month", { mode: "move" }),
    });
    const month = put("monthly", "2026-10-01", "");
    const { editor, state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);
    vi.spyOn(notes, "process").mockImplementation((path) => AsyncResult.err(new NoteWriteError(path, "disk full")));

    const result = await move(state, target("monthly", "2026-10-01", month));

    expectErr(result);
    expect(result.error).toBeInstanceOf(NoteWriteError);
    expect(editor.text).toBe("- [ ] Call Bob\n- [ ] Other\n");
    expect(editor.changes).toEqual([]);
  });

  it("a block id in move mode asks first and cancel writes nothing", async () => {
    const { harness, put, edit, text, move } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month", { mode: "move" }),
    });
    const month = put("monthly", "2026-10-01", "# October\n");
    const { editor, state } = edit("- [ ] Linked ^abc\n- [ ] Other ^other\n", 0);

    const pending = move(state, target("monthly", "2026-10-01", month));
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    expect(harness.modals.lastOpen().definition).toBe(confirmBlockLinkModal);
    harness.modals.lastOpen().cancel();
    const result = await pending;

    expectErr(result);
    expect(result.error).toBeInstanceOf(UserAborted);
    expect(await text(month)).toBe("# October\n");
    expect(editor.changes).toEqual([]);
  });

  it("move anyway keeps the id in the target", async () => {
    const { harness, put, edit, text, move } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month", { mode: "move" }),
    });
    const month = put("monthly", "2026-10-01", "");
    const { editor, state } = edit("- [ ] Linked ^abc\n- [ ] Other ^other\n", 0);

    const pending = move(state, target("monthly", "2026-10-01", month));
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    harness.modals.lastOpen().submit(undefined);
    const result = await pending;

    expectOk(result);
    expect(result.value.outcome).toBe("done");
    expect(await text(month)).toBe("- [ ] Linked ^abc\n");
    expect(editor.text).toBe("- [ ] Other ^other\n");
  });

  it("copy never asks about a block id", async () => {
    const { harness, put, edit, text, move } = await moverFor({
      daily: journal("daily", "day", { mode: "move" }),
      monthly: journal("monthly", "month", { mode: "copy" }),
    });
    const month = put("monthly", "2026-10-01", "");
    const { state } = edit("- [ ] Linked ^abc\n", 0);

    expectOk(await move(state, target("monthly", "2026-10-01", month)));

    expect(harness.modals.opens).toHaveLength(0);
    expect(await text(month)).toBe("- [ ] Linked\n");
  });

  it("the target journal's mode and heading apply", async () => {
    const { put, edit, text, move } = await moverFor({
      daily: journal("daily", "day", { mode: "copy", stamp: true, targetHeading: "Inbox" }),
      monthly: journal("monthly", "month", { mode: "move", targetHeading: "Tasks" }),
    });
    const month = put("monthly", "2026-10-01", "# Inbox\n## Tasks\n- [ ] existing\n\n## Notes\nfoo\n");
    const { editor, state } = edit("## Work\n- [ ] Call Bob\n- [ ] Other\n", 1);

    const result = await move(state, target("monthly", "2026-10-01", month));

    expectOk(result);
    expect(result.value.mode).toBe("move");
    expect(await text(month)).toBe("# Inbox\n## Tasks\n- [ ] existing\n- [ ] Call Bob\n\n## Notes\nfoo\n");
    expect(editor.text).toBe("## Work\n- [ ] Other\n");
  });

  it("a missing target note is created first", async () => {
    const { put, edit, text, move, index } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month"),
    });
    const september = put("monthly", "2026-09-01", "");
    const { editor, state } = edit("- [ ] Call Bob\n", 0);

    const result = await move(state, target("monthly", "2026-10-01", null));

    expectOk(result);
    const created = index.get("monthly", anchor("2026-10-01")).getOrUndefined();
    expect(created).toBeDefined();
    if (created === undefined) return;
    expect(await text(created)).toContain("- [ ] Call Bob\n");
    expect(await text(september)).toBe("");
    expect(editor.text).toBe("- [ ] Call Bob #rolled\n");
  });

  it("names a notelet target in the report", async () => {
    const { put, edit, text, move, notes } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month"),
    });
    const period = put("monthly", "2026-10-01", "");
    const notelet = "monthly/notelets/Planning.md" as VaultPath;
    notes.seed(notelet, "");
    const { state } = edit("- [ ] Call Bob\n", 0);

    const result = await move(state, {
      journalName: "monthly",
      anchor: anchor("2026-10-01"),
      path: notelet,
      label: LABEL,
      noteletTitle: "Planning",
    });

    expectOk(result);
    expect(result.value).toEqual({ mode: "copy", label: LABEL, noteletTitle: "Planning", outcome: "done" });
    expect(await text(notelet)).toBe("- [ ] Call Bob\n");
    expect(await text(period)).toBe("");
  });

  it("undo granularity: the source change is one editor change", async () => {
    const { put, edit, move } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month", { mode: "move" }),
    });
    const month = put("monthly", "2026-10-01", "");
    const { editor, state } = edit("- [ ] Keep\n- [ ] Project\n    - [ ] step\n        - detail\n- [ ] After", 1);

    expectOk(await move(state, target("monthly", "2026-10-01", month)));

    expect(editor.text).toBe("- [ ] Keep\n- [ ] After");
    expect(editor.changes).toHaveLength(1);
  });

  it("copy without a stamp writes no source", async () => {
    const { put, edit, move } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month", { stamp: false }),
    });
    const month = put("monthly", "2026-10-01", "");
    const { editor, state } = edit("- [ ] Call Bob\n", 0);

    const result = await move(state, target("monthly", "2026-10-01", month));

    expectOk(result);
    expect(result.value.outcome).toBe("done");
    expect(editor.changes).toEqual([]);
  });

  describe("a line that cannot move", () => {
    it("is refused when the cursor is on no task, and nothing is written", async () => {
      const { put, edit, text, move } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month"),
      });
      const month = put("monthly", "2026-10-01", "");
      const { editor, state } = edit("# Day\n- plain\n- [ ] Task\n", 1);

      const result = await move(state, target("monthly", "2026-10-01", month));

      expectErr(result);
      expect(result.error).toEqual(new SingleMoveRefusedError("not-a-task"));
      expect(await text(month)).toBe("");
      expect(editor.changes).toEqual([]);
    });

    it("is refused when the line was already rolled", async () => {
      const { put, edit, text, move } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month"),
      });
      const month = put("monthly", "2026-10-01", "");
      const { state } = edit("- [ ] Task #rolled\n- [ ] Fresh\n", 0);

      const result = await move(state, target("monthly", "2026-10-01", month));

      expectErr(result);
      expect(result.error).toBeInstanceOf(SingleMoveRefusedError);
      expect(result.error).toMatchObject({ reason: "rolled" });
      expect(await text(month)).toBe("");
    });
  });

  describe("a source no longer in the active editor", () => {
    it("is rewritten on disk once it still matches", async () => {
      const { harness, put, edit, text, move } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }),
      });
      const month = put("monthly", "2026-10-01", "");
      const { state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);
      const elsewhere = harness.host.openEditor("daily/2026-10-19.md", "- [ ] Call Bob\n", 0);

      const result = await move(state, target("monthly", "2026-10-01", month));

      expectOk(result);
      expect(result.value.outcome).toBe("done");
      expect(await text(SOURCE)).toBe("- [ ] Other\n");
      expect(elsewhere.changes).toEqual([]);
    });

    it("is left alone and reported when the file no longer matches", async () => {
      const { harness, put, edit, text, move, notes } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }),
      });
      const month = put("monthly", "2026-10-01", "");
      const { state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);
      harness.host.workspace.activeEditor = null;
      notes.seed(SOURCE, "- [ ] Saved above\n- [ ] Call Bob\n- [ ] Other\n");

      const result = await move(state, target("monthly", "2026-10-01", month));

      expectOk(result);
      expect(result.value.outcome).toBe("changed");
      expect(await text(month)).toBe("- [ ] Call Bob\n");
      expect(await text(SOURCE)).toBe("- [ ] Saved above\n- [ ] Call Bob\n- [ ] Other\n");
    });

    it("reports a disk write that fails", async () => {
      const { harness, put, edit, text, move, notes } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }),
      });
      const month = put("monthly", "2026-10-01", "");
      const { state } = edit("- [ ] Call Bob\n", 0);
      harness.host.workspace.activeEditor = null;
      const process = notes.process.bind(notes);
      vi.spyOn(notes, "process").mockImplementation((path, transform) =>
        path === SOURCE ? AsyncResult.err(new NoteWriteError(path, "locked")) : process(path, transform),
      );

      const result = await move(state, target("monthly", "2026-10-01", month));

      expectOk(result);
      expect(result.value.outcome).toBe("write-failed");
      expect(await text(month)).toBe("- [ ] Call Bob\n");
      expect(await text(SOURCE)).toBe("- [ ] Call Bob\n");
    });
  });

  it("waits for a move already writing into the same journal, and only that journal", async () => {
    const { put, edit, text, service, notes } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month"),
      yearly: journal("yearly", "year"),
    });
    const month = put("monthly", "2026-10-01", "");
    const year = put("yearly", "2026-01-01", "");
    const { state } = edit("- [ ] One\n- [ ] Two\n", 0);
    const process = notes.process.bind(notes);
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const spy = vi.spyOn(notes, "process");
    spy.mockImplementationOnce((path, transform) =>
      AsyncResult.fromPromise(gate, () => new NoteWriteError(path, "gate")).flatMap(() => process(path, transform)),
    );
    const written = (): VaultPath[] => spy.mock.calls.map(([path]) => path);

    const first = service.move(state, target("monthly", "2026-10-01", month));
    await vi.waitFor(() => expect(written()).toEqual([month]));
    const second = service.move({ ...state, cursorLine: 1 }, target("monthly", "2026-10-01", month));
    const elsewhere = service.move({ ...state, cursorLine: 1 }, target("yearly", "2026-01-01", year));
    await vi.waitFor(() => expect(written()).toEqual([month, year]));
    release();
    await Promise.all([first, second, elsewhere]);

    expect(written()).toEqual([month, year, month]);
    expect(await text(month)).toBe("- [ ] One\n- [ ] Two\n");
  });
});
