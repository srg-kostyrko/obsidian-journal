import * as v from "valibot";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import type { PeriodKind } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { UserAborted } from "@/infrastructure/flows";
import {
  NoteStructureService,
  NoteReadError,
  NotesService,
  NoteWriteError,
  WorkspaceService,
  type ActiveEditorState,
  type VaultPath,
} from "@/infrastructure/host";
import { FakeNoteStructureService, FakeNotesService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { overrideWith, testContainer } from "@/testing";

import { taskRuleSchema } from "../../conditions";
import { tasksCoreModule } from "../../module";
import { SingleMoveRefusedError } from "../errors";
import { RolloverService } from "../rollover-service";
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
  overrides: Partial<JournalConfig> = {},
): JournalConfig {
  return fixedJournal(
    name,
    { type },
    {
      ...overrides,
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
  return { harness, notes, structures, index, put, edit, text, service, move };
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
    expect(harness.modals.lastOpen().resolvedTitle).toBe(m.tasks_move_block_link_title());
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

  it("edits the source through a background pane that holds it, unsaved typing and all", async () => {
    const { harness, put, edit, text, move } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month", { mode: "move" }),
    });
    const month = put("monthly", "2026-10-01", "");
    const { editor, state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);
    editor.text = "- [ ] Call Bob\n- [ ] Other\n- [ ] Typed, unsaved\n";
    const active = harness.host.openEditor("daily/2026-10-19.md", "- [ ] Call Bob\n", 0);

    const result = await move(state, target("monthly", "2026-10-01", month));

    expectOk(result);
    expect(result.value.outcome).toBe("done");
    expect(editor.text).toBe("- [ ] Other\n- [ ] Typed, unsaved\n");
    expect(editor.changes).toHaveLength(1);
    expect(active.changes).toEqual([]);
    expect(await text(SOURCE)).toBe("- [ ] Call Bob\n- [ ] Other\n");
  });

  describe("a target an open view holds", () => {
    it("is written through the view, so typing it has not saved stays intact on its own line", async () => {
      const { harness, put, edit, text, move, notes } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month"),
      });
      const month = put("monthly", "2026-10-01", "# October\n");
      const other = put("monthly", "2026-09-01", "# September\n");
      const view = harness.host.openEditor(month, "# October\n", 0, { active: false });
      view.text = "# October\nNot saved yet.";
      harness.host.workspace.openWindows.set(month, "popout");
      const otherView = harness.host.openEditor(other, "# September\n", 0, { active: false });
      const { state } = edit("- [ ] Call Bob\n    - detail\n", 0);
      const process = vi.spyOn(notes, "process");

      const result = await move(state, target("monthly", "2026-10-01", month));

      expectOk(result);
      expect(result.value.outcome).toBe("done");
      expect(view.text).toBe("# October\nNot saved yet.\n- [ ] Call Bob\n    - detail");
      expect(view.changes).toHaveLength(1);
      expect(view.saves).toEqual([view.text]);
      expect(otherView.changes).toEqual([]);
      expect(process).not.toHaveBeenCalledWith(month, expect.anything());
      expect(await text(month)).toBe("# October\n");
    });

    it("is saved before the source is touched", async () => {
      const { harness, put, edit, move } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }),
      });
      const month = put("monthly", "2026-10-01", "");
      const view = harness.host.openEditor(month, "", 0, { active: false });
      const { promise: gate, resolve: release } = Promise.withResolvers<void>();
      view.pendingSave = gate;
      const { editor, state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);

      const pending = move(state, target("monthly", "2026-10-01", month));
      await vi.waitFor(() => expect(view.changes).toHaveLength(1));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(editor.changes).toEqual([]);
      release();
      expectOk(await pending);

      expect(view.saves).toEqual(["- [ ] Call Bob\n"]);
      expect(editor.text).toBe("- [ ] Other\n");
    });

    it("a failed save leaves the source untouched", async () => {
      const { harness, put, edit, move } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }),
      });
      const month = put("monthly", "2026-10-01", "");
      const view = harness.host.openEditor(month, "", 0, { active: false });
      view.pendingSave = Promise.reject(new Error("disk full"));
      const { editor, state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);

      const result = await move(state, target("monthly", "2026-10-01", month));

      expectErr(result);
      expect(result.error).toBeInstanceOf(NoteWriteError);
      expect(editor.changes).toEqual([]);
    });
  });

  describe("a source no open view holds", () => {
    it("is rewritten on disk once it still matches", async () => {
      const { harness, put, edit, text, move } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }),
      });
      const month = put("monthly", "2026-10-01", "");
      const { state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);
      harness.host.closeEditor(SOURCE);
      const elsewhere = harness.host.openEditor("daily/2026-10-19.md", "- [ ] Call Bob\n", 0);

      const result = await move(state, target("monthly", "2026-10-01", month));

      expectOk(result);
      expect(result.value.outcome).toBe("done");
      expect(await text(SOURCE)).toBe("- [ ] Other\n");
      expect(elsewhere.changes).toEqual([]);
    });

    it("a CRLF file on disk matches the editor's LF text and keeps its line endings", async () => {
      const { harness, put, edit, text, move, notes } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }),
      });
      const month = put("monthly", "2026-10-01", "");
      const { state } = edit("- [ ] Keep\n- [ ] Call Bob\n    - detail\n- [ ] Other\n", 1);
      harness.host.closeEditor(SOURCE);
      notes.seed(SOURCE, "- [ ] Keep\r\n- [ ] Call Bob\r\n    - detail\r\n- [ ] Other\r\n");

      const result = await move(state, target("monthly", "2026-10-01", month));

      expectOk(result);
      expect(result.value.outcome).toBe("done");
      expect(await text(month)).toBe("- [ ] Call Bob\n    - detail\n");
      expect(await text(SOURCE)).toBe("- [ ] Keep\r\n- [ ] Other\r\n");
    });

    it("is left alone and reported when the file changes during the target write", async () => {
      const { harness, put, edit, text, move, notes } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }),
      });
      const month = put("monthly", "2026-10-01", "");
      const { state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);
      harness.host.closeEditor(SOURCE);
      const process = notes.process.bind(notes);
      vi.spyOn(notes, "process").mockImplementation((path, transform) => {
        if (path === month) notes.seed(SOURCE, "- [ ] Saved above\n- [ ] Call Bob\n- [ ] Other\n");
        return process(path, transform);
      });

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
      harness.host.closeEditor(SOURCE);
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

    it("reports a source that cannot be read again, and writes nothing", async () => {
      const { harness, put, edit, text, move, notes } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }),
      });
      const month = put("monthly", "2026-10-01", "");
      const { state } = edit("- [ ] Call Bob\n", 0);
      harness.host.closeEditor(SOURCE);
      const read = notes.read.bind(notes);
      vi.spyOn(notes, "read").mockImplementation((path) =>
        path === SOURCE ? AsyncResult.err(new NoteReadError(path, "unreadable")) : read(path),
      );

      const result = await move(state, target("monthly", "2026-10-01", month));

      expectOk(result);
      expect(result.value).toEqual({ mode: "move", label: LABEL, outcome: "unread" });
      expect(await text(month)).toBe("");
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
    const { state } = edit("- [ ] One\n- [ ] Two\n- [ ] Three\n", 0);
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
    const elsewhere = service.move({ ...state, cursorLine: 2 }, target("yearly", "2026-01-01", year));
    await vi.waitFor(() => expect(written()).toEqual([month, year]));
    release();
    await Promise.all([first, second, elsewhere]);

    expect(written()).toEqual([month, year, month]);
    expect(await text(month)).toBe("- [ ] One\n- [ ] Two\n");
  });

  it("a second move of the same task, queued behind the first, writes nothing", async () => {
    for (const mode of ["copy", "move"] as const) {
      const { put, edit, text, service } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode }),
      });
      const month = put("monthly", "2026-10-01", "");
      const { editor, state } = edit("- [ ] Call Bob\n    - detail\n- [ ] Other\n", 0);

      const [first, second] = await Promise.all([
        service.move(state, target("monthly", "2026-10-01", month)),
        service.move(state, target("monthly", "2026-10-01", month)),
      ]);

      expectOk(first);
      expectOk(second);
      expect(first.value.outcome).toBe("done");
      expect(second.value).toEqual({ mode, label: LABEL, outcome: "nothing" });
      expect(await text(month)).toBe("- [ ] Call Bob\n    - detail\n");
      expect(editor.changes).toHaveLength(1);
      expect(editor.text).toContain("- [ ] Other\n");
    }
  });

  it("refuses a target that is the source note itself, before any write", async () => {
    const { put, edit, text, move, notes } = await moverFor({
      daily: journal("daily", "day", { mode: "move" }),
      monthly: journal("monthly", "month"),
    });
    const month = put("monthly", "2026-10-01", "");
    expect(put("daily", "2026-10-20", "- [ ] Call Bob\n")).toBe(SOURCE);
    const { editor, state } = edit("- [ ] Call Bob\n", 0);
    const process = vi.spyOn(notes, "process");

    for (const to of [target("daily", "2026-10-20", SOURCE), target("daily", "2026-10-20", null)]) {
      const result = await move(state, to);
      expectErr(result);
      expect(result.error).toEqual(new SingleMoveRefusedError("same-note"));
    }

    expect(process).not.toHaveBeenCalled();
    expect(editor.changes).toEqual([]);
    expect(await text(month)).toBe("");
  });

  it("cancelling the target's creation prompt writes nothing to either note", async () => {
    const { harness, edit, move, notes, index } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month", {}, { confirmCreation: true }),
    });
    const { editor, state } = edit("- [ ] Call Bob\n", 0);

    const pending = move(state, target("monthly", "2026-10-01", null));
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    harness.modals.lastOpen<unknown, boolean>().submit(false);
    const result = await pending;

    expectErr(result);
    expect(result.error).toBeInstanceOf(UserAborted);
    expect(index.get("monthly", anchor("2026-10-01")).isNone()).toBe(true);
    expect(notes.allMarkdownNotes()).toEqual([SOURCE]);
    expect(editor.changes).toEqual([]);
    expect(editor.text).toBe("- [ ] Call Bob\n");
  });

  it("a move out of a journal's note waits for a roll of that journal, which may take the same task", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 21, 9, 0, 0));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const { harness, put, edit, text, service, notes, structures } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month"),
      weekly: journal("weekly", "week"),
    });
    expect(put("daily", "2026-10-20", "- [ ] Call Bob\n")).toBe(SOURCE);
    structures.setStructure(SOURCE, {
      listItems: [{ marker: " ", line: 0, endLine: 0, parent: null }],
      headings: [],
      tags: [],
      frontmatterTags: [],
    });
    const today = put("daily", "2026-10-21", "");
    const month = put("monthly", "2026-10-01", "");
    const week = put("weekly", "2026-10-19", "");
    const { editor, state } = edit("- [ ] Call Bob\n", 0);
    const process = notes.process.bind(notes);
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const spy = vi.spyOn(notes, "process");
    spy.mockImplementationOnce((path, transform) =>
      AsyncResult.fromPromise(gate, () => new NoteWriteError(path, "gate")).flatMap(() => process(path, transform)),
    );
    const written = (): VaultPath[] => spy.mock.calls.map(([path]) => path);

    const roll = harness.resolve(RolloverService).roll("daily", { interactive: true });
    await vi.waitFor(() => expect(written()).toEqual([today]));
    const single = service.move(state, target("monthly", "2026-10-01", month));
    const loose = "notes/loose.md" as VaultPath;
    notes.seed(loose, "- [ ] Loose\n");
    const unrelated = service.move(
      { path: loose, content: "- [ ] Loose\n", cursorLine: 0 },
      target("weekly", "2026-10-19", week),
    );
    await vi.waitFor(() => expect(written()).toContain(week));
    expect(written()).not.toContain(month);
    release();
    const [, moved] = await Promise.all([roll, single, unrelated]);

    expectOk(moved);
    expect(moved.value.outcome).toBe("nothing");
    expect(await text(today)).toBe("- [ ] Call Bob\n");
    expect(await text(month)).toBe("");
    expect(editor.text).toBe("- [ ] Call Bob #rolled\n");
  });

  describe("an edit made while the target's creation prompt is open", () => {
    it("to the task itself is what moves, and the source is marked to match", async () => {
      const { harness, edit, text, move, index } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", {}, { confirmCreation: true }),
      });
      const { editor, state } = edit("# Day\n- [ ] Call Bob\n- [ ] Other\n", 1);

      const pending = move(state, target("monthly", "2026-10-01", null));
      await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
      editor.text = "# Day\n- [ ] Call Bob tomorrow\n    - ask about Friday\n- [ ] Other\n";
      harness.modals.lastOpen<unknown, boolean>().submit(true);
      const result = await pending;

      expectOk(result);
      expect(result.value.outcome).toBe("done");
      const created = index.get("monthly", anchor("2026-10-01")).getOrUndefined();
      expect(created).toBeDefined();
      if (created === undefined) return;
      expect(await text(created)).toContain("- [ ] Call Bob tomorrow\n    - ask about Friday\n");
      expect(await text(created)).not.toContain("Other");
      expect(editor.text).toBe("# Day\n- [ ] Call Bob tomorrow #rolled\n    - ask about Friday\n- [ ] Other\n");
    });

    it("that turns the task into its parent's continuation text moves nothing, not the parent", async () => {
      const { harness, edit, text, move, index } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }, { confirmCreation: true }),
      });
      const { editor, state } = edit("# Day\n- [ ] Parent\n    - [ ] Call Bob\n- [ ] Other\n", 2);

      const pending = move(state, target("monthly", "2026-10-01", null));
      await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
      editor.text = "# Day\n- [ ] Parent\n    more about the parent\n- [ ] Other\n";
      harness.modals.lastOpen<unknown, boolean>().submit(true);
      const result = await pending;

      expectOk(result);
      expect(result.value.outcome).toBe("nothing");
      const created = index.get("monthly", anchor("2026-10-01")).getOr("missing" as VaultPath);
      expect(await text(created)).not.toContain("Parent");
      expect(editor.changes).toEqual([]);
    });

    it("above the task moves nothing, since the line under the cursor is no longer the task", async () => {
      const { harness, edit, text, move, index } = await moverFor({
        daily: journal("daily", "day"),
        monthly: journal("monthly", "month", { mode: "move" }, { confirmCreation: true }),
      });
      const { editor, state } = edit("# Day\n- [ ] Call Bob\n- [ ] Other\n", 1);

      const pending = move(state, target("monthly", "2026-10-01", null));
      await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
      editor.text = "# Day\n- [ ] Typed above\n- [ ] Call Bob\n- [ ] Other\n";
      harness.modals.lastOpen<unknown, boolean>().submit(true);
      const result = await pending;

      expectOk(result);
      expect(result.value.outcome).toBe("nothing");
      const created = index.get("monthly", anchor("2026-10-01")).getOr("missing" as VaultPath);
      expect(await text(created)).not.toContain("- [ ]");
      expect(editor.text).toBe("# Day\n- [ ] Typed above\n- [ ] Call Bob\n- [ ] Other\n");
      expect(editor.changes).toEqual([]);
    });
  });

  it("waits for a roll writing into the same journal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 21, 9, 0, 0));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const { harness, put, edit, text, service, notes, structures } = await moverFor({
      daily: journal("daily", "day"),
      monthly: journal("monthly", "month"),
    });
    const earlier = put("daily", "2026-10-19", "- [ ] Old\n");
    structures.setStructure(earlier, {
      listItems: [{ marker: " ", line: 0, endLine: 0, parent: null }],
      headings: [],
      tags: [],
      frontmatterTags: [],
    });
    const today = put("daily", "2026-10-21", "");
    const month = put("monthly", "2026-10-01", "");
    const { state } = edit("- [ ] Call Bob\n- [ ] Other\n", 0);
    const process = notes.process.bind(notes);
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const spy = vi.spyOn(notes, "process");
    spy.mockImplementationOnce((path, transform) =>
      AsyncResult.fromPromise(gate, () => new NoteWriteError(path, "gate")).flatMap(() => process(path, transform)),
    );
    const written = (): VaultPath[] => spy.mock.calls.map(([path]) => path);

    const roll = harness.resolve(RolloverService).roll("daily", { interactive: true });
    await vi.waitFor(() => expect(written()).toEqual([today]));
    const single = service.move(state, target("daily", "2026-10-21", today));
    const elsewhere = service.move({ ...state, cursorLine: 1 }, target("monthly", "2026-10-01", month));
    await vi.waitFor(() => expect(written()).toContain(month));
    expect(written().filter((path) => path === today)).toHaveLength(1);
    release();
    await Promise.all([roll, single, elsewhere]);

    expect(written().filter((path) => path === today)).toHaveLength(2);
    expect(await text(today)).toBe("- [ ] Old\n- [ ] Call Bob\n");
  });
});
