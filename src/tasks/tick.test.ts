import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { journalsCoreModule } from "@/journals/module";
import { overrideWith, testContainer } from "@/testing";

import { tasksCoreModule } from "./module";
import { buildTaskItem } from "./testing";
import { canonicalSymbol, tickLine, tickRecurringLine, tickTargetStatus, TickService } from "./tick";

import type { TaskItem, TaskStatus } from "./types";

const TASKS_PLUGIN_ID = "obsidian-tasks-plugin";

const PATH = "Daily/2026-09-22.md" as VaultPath;

function item(line: number, markdown: string | null, overrides: Partial<TaskItem> = {}): TaskItem {
  return buildTaskItem({
    path: PATH,
    display: { kind: "line", path: PATH, line, endLine: line, parentLine: null, markdown },
    ...overrides,
  });
}

function spanning(line: number, endLine: number, markdown: string): TaskItem {
  return buildTaskItem({
    path: PATH,
    display: { kind: "line", path: PATH, line, endLine, parentLine: null, markdown },
  });
}

// The write rule's first clause is "never re-emit a line from a parsed model". A test that only
// compares two literals cannot tell a byte-preserving replacement from a lucky re-emission of the
// same line, so the nastiest cases assert positionally: exactly one index may differ.
function expectSingleCharacterEdit(before: string, after: string, index: number, symbol: string): void {
  expect(after.slice(0, index)).toBe(before.slice(0, index));
  expect(after.slice(index, index + symbol.length)).toBe(symbol);
  expect(after.slice(index + symbol.length)).toBe(before.slice(index + 1));
}

describe("tickLine", () => {
  it("replaces only the marker character, leaving the rest of the line byte-identical", () => {
    const content = "# Day\n\n- [ ] Ship it 📅 2026-09-25 #work\n";
    const result = tickLine(content, item(2, "- [ ] Ship it 📅 2026-09-25 #work"), "x");
    expect(result).toEqual({ content: "# Day\n\n- [x] Ship it 📅 2026-09-25 #work\n" });
  });

  it("aborts when the line no longer matches the item we hydrated", () => {
    const content = "# Day\n\n- [ ] Something else\n";
    expect(tickLine(content, item(2, "- [ ] Ship it"), "x")).toEqual({ reason: "moved" });
  });

  it("aborts when the line drifted past the end of the note", () => {
    expect(tickLine("# Day\n", item(9, "- [ ] Ship it"), "x")).toEqual({ reason: "moved" });
  });

  it("aborts on a negative line rather than addressing the note from the end", () => {
    expect(tickLine("a\nb\n- [ ] Ship it", item(-1, "- [ ] Ship it"), "x")).toEqual({ reason: "moved" });
  });

  it("aborts on a line that is not a whole number rather than appending a copy of the note", () => {
    expect(tickLine("- [ ] Ship it\nb\nc\n", item(NaN, "- [ ] Ship it"), "x")).toEqual({ reason: "moved" });
    expect(tickLine("- [ ] Ship it\n", item(Infinity, "- [ ] Ship it"), "x")).toEqual({
      reason: "moved",
    });
  });

  it("aborts on a fractional line rather than ticking the line it floors to", () => {
    expect(tickLine("x\n- [ ] Ship it\n", item(1.7, "- [ ] Ship it"), "x")).toEqual({ reason: "moved" });
  });

  it("aborts when the item was never hydrated, even where the line it points at is blank", () => {
    expect(tickLine("\n\n", item(0, null), "x")).toEqual({ reason: "moved" });
  });

  it("handles an ordered-list task marker", () => {
    const content = "1. [ ] Ship it\n";
    expect(tickLine(content, item(0, "1. [ ] Ship it"), "x")).toEqual({ content: "1. [x] Ship it\n" });
  });

  it("handles an ordered-list task marker closed with a parenthesis", () => {
    const content = "12) [ ] Ship it\n";
    expect(tickLine(content, item(0, "12) [ ] Ship it"), "x")).toEqual({ content: "12) [x] Ship it\n" });
  });

  it("handles the star and plus bullets", () => {
    expect(tickLine("* [ ] Ship it\n", item(0, "* [ ] Ship it"), "x")).toEqual({ content: "* [x] Ship it\n" });
    expect(tickLine("+ [ ] Ship it\n", item(0, "+ [ ] Ship it"), "x")).toEqual({ content: "+ [x] Ship it\n" });
  });

  it("replaces a marker that is not a space", () => {
    const content = "- [/] Ship it\n";
    expect(tickLine(content, item(0, "- [/] Ship it"), "x")).toEqual({ content: "- [x] Ship it\n" });
  });

  it("refuses a line that is not a task at all", () => {
    expect(tickLine("- Ship it\n", item(0, "- Ship it"), "x")).toEqual({ reason: "not-a-task" });
  });

  it("refuses a checkbox that is not at the start of the line", () => {
    const line = "Some prose - [ ] Ship it";
    expect(tickLine(`${line}\n`, item(0, line), "x")).toEqual({ reason: "not-a-task" });
  });

  it("refuses a bullet with no space before the brackets", () => {
    expect(tickLine("-[ ] Ship it\n", item(0, "-[ ] Ship it"), "x")).toEqual({ reason: "not-a-task" });
  });

  it("refuses an empty pair of brackets", () => {
    expect(tickLine("- [] Ship it\n", item(0, "- [] Ship it"), "x")).toEqual({ reason: "not-a-task" });
  });

  it("ticks a task inside a blockquote", () => {
    expect(tickLine("> - [ ] Ship it\n", item(0, "> - [ ] Ship it"), "x")).toEqual({ content: "> - [x] Ship it\n" });
  });

  it("ticks a task inside a nested blockquote", () => {
    const line = "> > - [ ] Ship it";
    expect(tickLine(`${line}\n`, item(0, line), "x")).toEqual({ content: "> > - [x] Ship it\n" });
  });

  it("ticks a task inside a callout, keeping the quote marker and the marker it had", () => {
    const content = "> [!todo] Chores\n> 2) [/] Water the plants\n";
    const result = tickLine(content, item(1, "> 2) [/] Water the plants"), "x");
    expect(result).toEqual({ content: "> [!todo] Chores\n> 2) [x] Water the plants\n" });
  });

  it("ticks a quoted task written with no space after the quote marker", () => {
    expect(tickLine(">- [ ] Ship it\n", item(0, ">- [ ] Ship it"), "x")).toEqual({ content: ">- [x] Ship it\n" });
  });

  it("refuses quoted prose", () => {
    expect(tickLine("> Some prose\n", item(0, "> Some prose"), "x")).toEqual({ reason: "not-a-task" });
  });

  it("refuses a quoted callout header", () => {
    expect(tickLine("> [!todo] Chores\n", item(0, "> [!todo] Chores"), "x")).toEqual({ reason: "not-a-task" });
  });

  it("refuses a quoted list item that carries no checkbox", () => {
    expect(tickLine("> - Ship it\n", item(0, "> - Ship it"), "x")).toEqual({ reason: "not-a-task" });
  });

  it("refuses a checkbox with no list bullet, quoted or not", () => {
    expect(tickLine("[ ] Ship it\n", item(0, "[ ] Ship it"), "x")).toEqual({ reason: "not-a-task" });
    expect(tickLine("> [ ] Ship it\n", item(0, "> [ ] Ship it"), "x")).toEqual({ reason: "not-a-task" });
  });

  it("refuses an indented checkbox with no list bullet", () => {
    expect(tickLine("  [ ] Ship it\n", item(0, "  [ ] Ship it"), "x")).toEqual({ reason: "not-a-task" });
    expect(tickLine("\t[ ] Ship it\n", item(0, "\t[ ] Ship it"), "x")).toEqual({ reason: "not-a-task" });
  });

  it("replaces a marker that is a single emoji", () => {
    expect(tickLine("- [✅] Ship it\n", item(0, "- [✅] Ship it"), " ")).toEqual({ content: "- [ ] Ship it\n" });
  });

  it("replaces a marker that is an astral emoji, which spans two UTF-16 units", () => {
    expect(tickLine("- [🔁] Ship it\n", item(0, "- [🔁] Ship it"), "x")).toEqual({ content: "- [x] Ship it\n" });
  });

  it("writes an astral symbol into the marker", () => {
    expect(tickLine("- [ ] Ship it\n", item(0, "- [ ] Ship it"), "🔁")).toEqual({ content: "- [🔁] Ship it\n" });
  });

  it("writes the symbol it is given rather than a hardcoded one", () => {
    expect(tickLine("- [ ] Ship it\n", item(0, "- [ ] Ship it"), "✅")).toEqual({ content: "- [✅] Ship it\n" });
    expect(tickLine("- [x] Ship it\n", item(0, "- [x] Ship it"), " ")).toEqual({ content: "- [ ] Ship it\n" });
  });

  it("leaves a later bracket pair on the same line alone", () => {
    const content = "- [ ] Ship it, then fix [ ] in the README\n";
    expect(tickLine(content, item(0, "- [ ] Ship it, then fix [ ] in the README"), "x")).toEqual({
      content: "- [x] Ship it, then fix [ ] in the README\n",
    });
  });

  it("replaces only the item's first line when the item spans several", () => {
    const content = "- [ ] Ship it\n  with a continuation - [ ] line\n- [ ] Other\n";
    const result = tickLine(content, spanning(0, 1, "- [ ] Ship it\n  with a continuation - [ ] line"), "x");
    expect(result).toEqual({ content: "- [x] Ship it\n  with a continuation - [ ] line\n- [ ] Other\n" });
  });

  it("verifies against the item's first line only when the item spans several", () => {
    const content = "- [ ] Ship it\n  a continuation that has since been edited\n";
    const result = tickLine(content, spanning(0, 1, "- [ ] Ship it\n  the continuation as hydrated"), "x");
    expect(result).toEqual({ content: "- [x] Ship it\n  a continuation that has since been edited\n" });
  });

  it("preserves a file with no trailing newline", () => {
    expect(tickLine("- [ ] Ship it", item(0, "- [ ] Ship it"), "x")).toEqual({ content: "- [x] Ship it" });
  });

  it("changes one byte of a tab-indented nested task carrying signifiers, a tag and a block id", () => {
    const line = "\t\t3) [/] Water the plants  🔁 every week 📅 2026-09-25 [priority:: high] #home ^abc123  ";
    const content = `# Day\n\n- [ ] Parent\n${line}\n\nfooter\n`;
    const result = tickLine(content, item(3, line), "x");

    expect("content" in result).toBe(true);
    if (!("content" in result)) return;
    expectSingleCharacterEdit(content, result.content, content.indexOf("[/]") + 1, "x");
  });

  it("changes one byte of that same task quoted inside a nested callout", () => {
    const line = "  > > \t3) [/] Water the plants  🔁 every week 📅 2026-09-25 [priority:: high] #home ^abc123  ";
    const content = `# Day\n\n> [!todo] Chores\n${line}\n\nfooter\n`;
    const result = tickLine(content, item(3, line), "x");

    expect("content" in result).toBe(true);
    if (!("content" in result)) return;
    expectSingleCharacterEdit(content, result.content, content.indexOf("[/]") + 1, "x");
  });

  it("writes an astral symbol without disturbing the surrogate pairs around it", () => {
    const line = "  - [ ] Ship 𝛁 it 🔁 ✅ 2026-09-25";
    const content = `${line}\n`;
    const result = tickLine(content, item(0, line), "🏁");

    expect("content" in result).toBe(true);
    if (!("content" in result)) return;
    expect("🏁".length).toBe(2);
    expectSingleCharacterEdit(content, result.content, content.indexOf("[ ]") + 1, "🏁");
  });

  it("refuses an item that has no line at all", () => {
    const note = buildTaskItem({ path: PATH, display: { kind: "note", path: PATH, title: "Ship it" } });
    expect(tickLine("- [ ] Ship it\n", note, "x")).toEqual({ reason: "not-a-task" });
  });
});

describe("tickRecurringLine", () => {
  it("delegates to the toggle and splices in its replacement, which may span more than one line", () => {
    const content = "# Day\n\n- [ ] Water plants 🔁 every week\n\nfooter\n";
    const toggle = vi.fn(() => "- [x] Water plants 🔁 every week ✅ 2026-09-25\n- [ ] Water plants 🔁 every week");

    const result = tickRecurringLine(content, item(2, "- [ ] Water plants 🔁 every week"), toggle);

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith("- [ ] Water plants 🔁 every week", PATH);
    expect(result).toEqual({
      content: "# Day\n\n- [x] Water plants 🔁 every week ✅ 2026-09-25\n- [ ] Water plants 🔁 every week\n\nfooter\n",
    });
  });

  it("aborts when the line no longer matches the item we hydrated, and never calls the toggle", () => {
    const content = "# Day\n\n- [ ] Something else\n";
    const toggle = vi.fn();

    expect(tickRecurringLine(content, item(2, "- [ ] Water plants 🔁 every week"), toggle)).toEqual({
      reason: "moved",
    });
    expect(toggle).not.toHaveBeenCalled();
  });

  it("aborts on a negative line rather than addressing the note from the end", () => {
    const toggle = vi.fn();
    expect(tickRecurringLine("a\nb\n- [ ] Water plants 🔁", item(-1, "- [ ] Water plants 🔁"), toggle)).toEqual({
      reason: "moved",
    });
    expect(toggle).not.toHaveBeenCalled();
  });

  it("aborts when the item was never hydrated, and never calls the toggle", () => {
    const toggle = vi.fn();
    expect(tickRecurringLine("\n\n", item(0, null), toggle)).toEqual({ reason: "moved" });
    expect(toggle).not.toHaveBeenCalled();
  });

  it("refuses a line that is not a task at all, and never calls the toggle", () => {
    const line = "- Water plants 🔁 every week";
    const toggle = vi.fn();
    expect(tickRecurringLine(`${line}\n`, item(0, line), toggle)).toEqual({ reason: "not-a-task" });
    expect(toggle).not.toHaveBeenCalled();
  });

  it("refuses an item that has no line at all, and never calls the toggle", () => {
    const note = buildTaskItem({ path: PATH, display: { kind: "note", path: PATH, title: "Water plants" } });
    const toggle = vi.fn();
    expect(tickRecurringLine("- [ ] Water plants 🔁 every week\n", note, toggle)).toEqual({ reason: "not-a-task" });
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe("tickTargetStatus", () => {
  it("sends an open item to done and a finished one back to todo", () => {
    expect(tickTargetStatus("todo")).toBe("done");
    expect(tickTargetStatus("in-progress")).toBe("done");
    expect(tickTargetStatus("on-hold")).toBe("done");
    expect(tickTargetStatus("done")).toBe("todo");
    expect(tickTargetStatus("cancelled")).toBe("todo");
  });
});

describe("canonicalSymbol", () => {
  it("reads the symbol the user's map assigns to the status", () => {
    expect(canonicalSymbol({ done: "✅", todo: " " }, "done")).toBe("✅");
    expect(canonicalSymbol({ done: "✅", todo: " " }, "todo")).toBe(" ");
  });

  it("refuses a status the map has no symbol for", () => {
    expect(canonicalSymbol({ todo: " " }, "done")).toBeNull();
  });

  it("refuses a value that is not a single marker", () => {
    expect(canonicalSymbol({ done: "" }, "done")).toBeNull();
    expect(canonicalSymbol({ done: "xy" }, "done")).toBeNull();
  });

  it("refuses a line terminator, which is one code point but would cut the line in two", () => {
    expect(canonicalSymbol({ done: "\n" }, "done")).toBeNull();
    expect(canonicalSymbol({ done: "\r" }, "done")).toBeNull();
  });

  it("accepts an astral marker, which the status-map editor also counts as one", () => {
    expect(canonicalSymbol({ done: "🔁" }, "done")).toBe("🔁");
  });
});

async function build(options: { content: string; canonical?: Record<string, string> }) {
  const notes = new FakeNotesService();
  notes.seed(PATH, options.content);
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: options.canonical === undefined ? {} : { tasksCheckbox: { canonical: options.canonical } },
    overrides: [overrideWith(NotesService, notes as unknown as NotesService)],
  });
  return { harness, notes, service: harness.resolve(TickService) };
}

async function contentOf(notes: FakeNotesService): Promise<string> {
  const read = await notes.read(PATH);
  expectOk(read);
  return read.value;
}

describe("TickService", () => {
  it("writes the symbol the user's map assigns to done", async () => {
    const { notes, service } = await build({
      content: "- [ ] Ship it\n",
      canonical: { todo: " ", done: "✓" },
    });

    expectOk(await service.toggle(item(0, "- [ ] Ship it")));

    expect(await contentOf(notes)).toBe("- [✓] Ship it\n");
  });

  it("writes the symbol the user's map assigns to todo when the item is already done", async () => {
    const { notes, service } = await build({
      content: "- [x] Ship it\n",
      canonical: { todo: "•", done: "x" },
    });

    expectOk(await service.toggle(item(0, "- [x] Ship it", { status: "done" satisfies TaskStatus })));

    expect(await contentOf(notes)).toBe("- [•] Ship it\n");
  });

  it("leaves the note untouched when the line moved", async () => {
    const content = "- [ ] Something else\n";
    const { notes, service } = await build({ content });

    const result = await service.toggle(item(0, "- [ ] Ship it"));

    expectErr(result);
    expect(result.error.kind).toBe("task-line-moved");
    expect(await contentOf(notes)).toBe(content);
  });

  it("leaves the note untouched when the line is not a task", async () => {
    const content = "Ship it\n";
    const { notes, service } = await build({ content });

    const result = await service.toggle(item(0, "Ship it"));

    expectErr(result);
    expect(result.error.kind).toBe("not-a-task-line");
    expect(await contentOf(notes)).toBe(content);
  });

  it("leaves the note untouched when the map has no symbol for the status it would write", async () => {
    const content = "- [ ] Ship it\n";
    const { notes, service } = await build({ content, canonical: { todo: " " } });

    const result = await service.toggle(item(0, "- [ ] Ship it"));

    expectErr(result);
    expect(result.error.kind).toBe("no-canonical-symbol");
    expect(await contentOf(notes)).toBe(content);
  });

  it.each([
    ["a newline", "\n"],
    ["a carriage return", "\r"],
  ])("never opens the note when the map assigns %s to the status it would write", async (_label, symbol) => {
    const content = "- [ ] Ship it\n";
    const { notes, service } = await build({ content, canonical: { todo: " ", done: symbol } });
    const process = vi.spyOn(notes, "process");

    const result = await service.toggle(item(0, "- [ ] Ship it"));

    expectErr(result);
    expect(result.error.kind).toBe("no-canonical-symbol");
    expect(process).not.toHaveBeenCalled();
    expect(await contentOf(notes)).toBe(content);
  });

  it.each([
    ["not a whole number", NaN],
    ["fractional", 1.7],
  ])("never opens the note when the item's line is %s", async (_label, line) => {
    const content = "x\n- [ ] Ship it\nb\n";
    const { notes, service } = await build({ content });
    const process = vi.spyOn(notes, "process");

    const result = await service.toggle(item(line, "- [ ] Ship it"));

    expectErr(result);
    expect(result.error.kind).toBe("task-line-moved");
    expect(process).not.toHaveBeenCalled();
    expect(await contentOf(notes)).toBe(content);
  });

  it("refuses an item that has no line", async () => {
    const { service } = await build({ content: "- [ ] Ship it\n" });
    const note = buildTaskItem({ path: PATH, display: { kind: "note", path: PATH, title: "Ship it" } });

    const result = await service.toggle(note);

    expectErr(result);
    expect(result.error.kind).toBe("not-a-task-line");
  });

  it("reports a note that is gone rather than throwing", async () => {
    const { service } = await build({ content: "- [ ] Ship it\n" });

    const result = await service.toggle(
      buildTaskItem({
        path: "Daily/missing.md" as VaultPath,
        display: {
          kind: "line",
          path: "Daily/missing.md" as VaultPath,
          line: 0,
          endLine: 0,
          parentLine: null,
          markdown: "- [ ] Ship it",
        },
      }),
    );

    expectErr(result);
    expect(result.error.kind).toBe("note-not-found");
  });

  it("delegates a recurring line to the Tasks plugin's own toggle", async () => {
    const content = "- [ ] Water plants 🔁 every week\n";
    const { harness, notes, service } = await build({ content });
    const toggle = vi.fn(() => "- [x] Water plants 🔁 every week ✅ 2026-09-25\n- [ ] Water plants 🔁 every week");
    harness.host.putPlugin(TASKS_PLUGIN_ID, { apiV1: { executeToggleTaskDoneCommand: toggle } });

    const result = await service.toggle(item(0, "- [ ] Water plants 🔁 every week"));

    expectOk(result);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith("- [ ] Water plants 🔁 every week", PATH);
    expect(await contentOf(notes)).toBe(
      "- [x] Water plants 🔁 every week ✅ 2026-09-25\n- [ ] Water plants 🔁 every week\n",
    );
  });

  it("never consults the status map for a recurring line — Tasks decides its own symbol", async () => {
    const content = "- [ ] Water plants 🔁 every week\n";
    // No canonical map seeded at all: a non-recurring toggle would refuse with no-canonical-symbol.
    const { harness, notes, service } = await build({ content, canonical: {} });
    const toggle = vi.fn(() => "- [x] Water plants 🔁 every week");
    harness.host.putPlugin(TASKS_PLUGIN_ID, { apiV1: { executeToggleTaskDoneCommand: toggle } });

    const result = await service.toggle(item(0, "- [ ] Water plants 🔁 every week"));

    expectOk(result);
    expect(await contentOf(notes)).toBe("- [x] Water plants 🔁 every week\n");
  });

  it("leaves the note untouched when a recurring line moved", async () => {
    const content = "- [ ] Something else\n";
    const { harness, notes, service } = await build({ content });
    const toggle = vi.fn();
    harness.host.putPlugin(TASKS_PLUGIN_ID, { apiV1: { executeToggleTaskDoneCommand: toggle } });

    const result = await service.toggle(item(0, "- [ ] Water plants 🔁 every week"));

    expectErr(result);
    expect(result.error.kind).toBe("task-line-moved");
    expect(toggle).not.toHaveBeenCalled();
    expect(await contentOf(notes)).toBe(content);
  });

  it("treats an unhydrated item as non-recurring, since the signifier cannot be read without markdown", async () => {
    const { harness, service } = await build({ content: "\n", canonical: { todo: " ", done: "x" } });
    harness.host.putPlugin(TASKS_PLUGIN_ID, { apiV1: { executeToggleTaskDoneCommand: vi.fn() } });

    const result = await service.toggle(item(0, null));

    expectErr(result);
    expect(result.error.kind).toBe("task-line-moved");
  });

  it.each([
    ["is not loaded", undefined],
    ["exposes no apiV1", {}],
    ["exposes an apiV1 that is not an object", { apiV1: "nope" }],
    ["exposes an apiV1 with no toggle method", { apiV1: {} }],
    ["exposes a toggle that is not a function", { apiV1: { executeToggleTaskDoneCommand: "nope" } }],
  ])(
    "refuses a recurring line and writes nothing when the Tasks plugin %s, and shows a notice",
    async (_label, plugin) => {
      const content = "- [ ] Water plants 🔁 every week\n";
      const { harness, notes, service } = await build({ content });
      if (plugin !== undefined) harness.host.putPlugin(TASKS_PLUGIN_ID, plugin);
      const process = vi.spyOn(notes, "process");

      const result = await service.toggle(item(0, "- [ ] Water plants 🔁 every week"));

      expectErr(result);
      expect(result.error.kind).toBe("recurring-unsupported");
      expect(process).not.toHaveBeenCalled();
      expect(await contentOf(notes)).toBe(content);
      expect(harness.notices.messages).toEqual([m.tasks_tick_recurring_needs_tasks_plugin()]);
    },
  );
});
