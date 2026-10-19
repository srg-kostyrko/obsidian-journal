import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { NoteMetadataService, NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNotesService } from "@/infrastructure/host/testing";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { journalsCoreModule } from "@/journals/module";
import { overrideWith, testContainer } from "@/testing";

import { tasksCoreModule } from "../../module";
import { buildTaskItem } from "../../testing";

import { NotePropertyTicker } from "./tick";

import type { TaskStatus } from "../../types";

const PATH = "Tasks/Ship it.md" as VaultPath;

// The faked instant below, with this machine's own UTC offset, the shape TaskNotes writes.
function localOffset(at: Date): string {
  const minutes = -at.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}
const NOW = new Date(2026, 9, 19, 14, 5, 9);
const MODIFIED = `2026-10-19T14:05:09${localOffset(NOW)}`;

function noteItem(status: TaskStatus = "todo") {
  return buildTaskItem({
    provider: "note-property",
    key: `note-property:${PATH}`,
    path: PATH,
    status,
    relations: ["date"],
    capabilities: { movable: false, stampable: false, retargetable: true },
    display: { kind: "note", path: PATH, title: "Ship it" },
  });
}

async function build(
  frontmatter: Record<string, unknown>,
  slice: Record<string, unknown> = {},
  options: { resolved?: boolean } = {},
) {
  const notes = new FakeNotesService();
  const metadata = new FakeNoteMetadataService();
  notes.seed(PATH, "", frontmatter);
  if (options.resolved ?? true) {
    metadata.setMetadata(PATH, { title: "Ship it", tags: ["#task"], properties: frontmatter });
  }
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { tasksNoteProperty: { enabled: true, ...slice } },
    overrides: [overrideWith(NotesService, notes as never), overrideWith(NoteMetadataService, metadata as never)],
  });
  return { harness, notes, metadata, ticker: harness.resolve(NotePropertyTicker) };
}

describe("NotePropertyTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks an open note done, stamping the completion date and the modified time", async () => {
    const { notes, ticker } = await build({ status: "open", due: "2026-10-21", tags: ["task"] });

    expectOk(await ticker.toggle(noteItem("todo")));

    expect(notes.frontmatterOf(PATH)).toEqual({
      status: "done",
      due: "2026-10-21",
      tags: ["task"],
      completedDate: "2026-10-19",
      dateModified: MODIFIED,
    });
  });

  it("reopens a done note and removes its completion date", async () => {
    const { notes, ticker } = await build({ status: "done", completedDate: "2026-10-01", title: "Ship it" });

    expectOk(await ticker.toggle(noteItem("done")));

    expect(notes.frontmatterOf(PATH)).toEqual({
      status: "open",
      title: "Ship it",
      dateModified: MODIFIED,
    });
  });

  it("writes a canonical value of true as a YAML boolean, the shape TaskNotes reads back", async () => {
    const { notes, ticker } = await build(
      { status: false },
      { statusMap: { true: "done", false: "todo" }, canonical: { todo: "false", done: "true" } },
    );

    expectOk(await ticker.toggle(noteItem("todo")));
    expect(notes.frontmatterOf(PATH)?.status).toBe(true);
  });

  it("writes a canonical value of false as a YAML boolean too", async () => {
    const { notes, ticker } = await build(
      { status: true },
      { statusMap: { true: "done", false: "todo" }, canonical: { todo: "false", done: "true" } },
    );

    expectOk(await ticker.toggle(noteItem("done")));
    expect(notes.frontmatterOf(PATH)?.status).toBe(false);
  });

  it("writes no completion date when none is mapped, and no modified time when none is mapped", async () => {
    const { notes, ticker } = await build(
      { status: "open" },
      { dates: { due: "due", scheduled: "scheduled" }, modifiedProperty: "" },
    );

    expectOk(await ticker.toggle(noteItem("todo")));
    expect(notes.frontmatterOf(PATH)).toEqual({ status: "done" });
  });

  it("writes into the property names the vault maps, not the defaults", async () => {
    const { notes, ticker } = await build(
      { state: "todo" },
      {
        statusProperty: "state",
        statusMap: { todo: "todo", finished: "done" },
        canonical: { todo: "todo", done: "finished" },
        dates: { done: "completed" },
        modifiedProperty: "updated",
      },
    );

    expectOk(await ticker.toggle(noteItem("todo")));
    expect(notes.frontmatterOf(PATH)).toEqual({
      state: "finished",
      completed: "2026-10-19",
      updated: MODIFIED,
    });
  });

  it("refuses when the vault's map has no value to write for the target status", async () => {
    const frontmatter = { status: "open" };
    const { notes, ticker } = await build(frontmatter, { canonical: { todo: "open" } });

    const result = await ticker.toggle(noteItem("todo"));

    expectErr(result);
    expect(result.error.kind).toBe("no-canonical-symbol");
    expect(notes.frontmatterOf(PATH)).toEqual(frontmatter);
  });

  it.each([
    ["recurrence", { recurrence: "FREQ=DAILY" }],
    ["recurrence_parent", { recurrence_parent: "[[Ship it series]]" }],
  ])("refuses a note carrying %s, leaving it untouched and saying so once", async (_label, extra) => {
    const frontmatter = { status: "open", ...extra };
    const { harness, notes, ticker } = await build(frontmatter);
    const update = vi.spyOn(notes, "updateFrontmatter");

    const result = await ticker.toggle(noteItem("todo"));

    expectErr(result);
    expect(result.error.kind).toBe("recurring-unsupported");
    expect(update).not.toHaveBeenCalled();
    expect(notes.frontmatterOf(PATH)).toEqual(frontmatter);
    expect(harness.notices.messages).toEqual([m.tasks_tick_recurring_task_note()]);
  });

  // The cache lags the file: a sync or an edit can add recurrence after the cache last read it.
  it("refuses a note whose live frontmatter is recurring though its cached metadata is not", async () => {
    const frontmatter = { status: "open", recurrence: "FREQ=DAILY" };
    const { harness, notes, metadata, ticker } = await build(frontmatter);
    metadata.setMetadata(PATH, { title: "Ship it", tags: ["#task"], properties: { status: "open" } });

    const result = await ticker.toggle(noteItem("todo"));

    expectErr(result);
    expect(result.error.kind).toBe("recurring-unsupported");
    expect(notes.frontmatterOf(PATH)).toEqual(frontmatter);
    expect(harness.notices.messages).toEqual([m.tasks_tick_recurring_task_note()]);
  });

  it("refuses to write while the note's metadata is unresolved, since recurrence cannot be ruled out", async () => {
    const frontmatter = { status: "open", recurrence: "FREQ=DAILY" };
    const { notes, ticker } = await build(frontmatter, {}, { resolved: false });
    const update = vi.spyOn(notes, "updateFrontmatter");

    const result = await ticker.toggle(noteItem("todo"));

    expectErr(result);
    expect(result.error.kind).toBe("note-not-found");
    expect(update).not.toHaveBeenCalled();
    expect(notes.frontmatterOf(PATH)).toEqual(frontmatter);
  });

  it("reports a note that is gone rather than throwing", async () => {
    const { notes, ticker } = await build({ status: "open" });
    await notes.delete(PATH);

    const result = await ticker.toggle(noteItem("todo"));

    expectErr(result);
    expect(result.error.kind).toBe("note-not-found");
  });
});
