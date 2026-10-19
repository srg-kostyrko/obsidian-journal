import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { MarkdownRenderService, WorkspaceService, type VaultPath } from "@/infrastructure/host";
import { FakeMarkdownRenderService, FakeWorkspaceService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { NotATaskLineError, RecurringUnsupportedError, type TickError } from "../errors";
import { tasksCoreModule } from "../module";
import { buildTaskItem } from "../testing";
import { TickService } from "../tick";

import TaskList from "./TaskList.vue";

import type { TaskListingRow } from "../listing";
import type { TaskItem, TaskStatus } from "../types";

// `line` defaults to a fresh number per row: buildTaskItem keys an item `${path}:${line}`, so two
// rows built at the same line would render under one `:key` and Vue would reuse a single component
// for both.
let nextLine = 0;

function row(
  overrides: {
    markdown?: string;
    depth?: number;
    context?: boolean;
    sourceLabel?: string;
    line?: number;
  } = {},
): TaskListingRow {
  const lineNumber = overrides.line ?? nextLine++;
  const path = "Daily/2026-09-22.md" as VaultPath;
  const item: TaskItem = buildTaskItem({
    path,
    key: `${path}:${lineNumber}`,
    display: {
      kind: "line",
      path,
      line: lineNumber,
      endLine: lineNumber,
      parentLine: null,
      markdown: overrides.markdown ?? "- [ ] Task",
    },
  });
  return {
    key: item.key,
    item,
    source: { kind: "note", path: item.path, label: overrides.sourceLabel ?? "2026-09-22" },
    depth: overrides.depth ?? 0,
    context: overrides.context ?? false,
  };
}

const TASK_NOTE = "Tasks/Ship it.md" as VaultPath;

function noteRow(overrides: { status?: TaskStatus; title?: string } = {}): TaskListingRow {
  const item: TaskItem = buildTaskItem({
    provider: "note-property",
    key: `note-property:${TASK_NOTE}`,
    path: TASK_NOTE,
    status: overrides.status ?? "todo",
    relations: ["date"],
    capabilities: { movable: false, stampable: false, retargetable: true },
    display: { kind: "note", path: TASK_NOTE, title: overrides.title ?? "Ship it" },
  });
  return {
    key: item.key,
    item,
    source: { kind: "task-note", path: TASK_NOTE, label: "Ship it" },
    depth: 0,
    context: false,
  };
}

// Stands in for Obsidian's renderer on the one line shape a task-note row hands it — a checkbox
// followed by an aliased internal link — so the row's own handling of the drawn controls can be driven.
// The parse is Obsidian's (app.js 1.8.7): the link ends at the first `]]`, a link holding `[[` is
// not a link, and the alias is everything after the first `|`. Anything else renders as text, so
// a title that breaks the link leaves no anchor behind.
function linkLineMarkdown(): MarkdownRenderService {
  return {
    render(element: HTMLElement, markdown: string): () => void {
      const [whole, marker, inner] = /^- \[(.)\] \[\[(.+?)\]\]/u.exec(markdown) ?? [];
      if (whole !== markdown || marker === undefined || inner === undefined || inner.includes("[[")) {
        element.textContent = markdown;
        return () => element.replaceChildren();
      }
      const pipe = inner.indexOf("|");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = marker !== " ";
      const link = document.createElement("a");
      link.className = "internal-link";
      link.dataset.href = inner.slice(0, pipe).trim();
      link.textContent = inner.slice(pipe + 1).trim();
      element.replaceChildren(input, link);
      return () => element.replaceChildren();
    },
  } as unknown as MarkdownRenderService;
}

async function mountNotes(toggle = vi.fn(() => AsyncResult.ok<void>(undefined))) {
  const workspace = new FakeWorkspaceService();
  const harness = await testContainer({
    modules: [tasksCoreModule],
    overrides: [
      overrideWith(MarkdownRenderService, linkLineMarkdown()),
      overrideWith(TickService, { toggle } as unknown as TickService),
      overrideWith(WorkspaceService, workspace as unknown as WorkspaceService),
    ],
  });
  return { harness, toggle, workspace };
}

// An anchor without an href has no link role, so it is found by its class, as Obsidian draws it.
function internalLink(): HTMLElement | null {
  return document.querySelector<HTMLElement>("a.internal-link");
}

function renderedCheckbox(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("checkbox");
}

function stubMarkdown(): MarkdownRenderService {
  return new FakeMarkdownRenderService() as unknown as MarkdownRenderService;
}

// Obsidian's own renderer emits the checkbox as part of the line; the unit-tier fake emits text
// only, so a test about the rendered control's own state needs a renderer that produces one.
function checkboxMarkdown(): MarkdownRenderService {
  return {
    render(element: HTMLElement, markdown: string): () => void {
      const input = document.createElement("input");
      input.type = "checkbox";
      element.replaceChildren(input, document.createTextNode(markdown));
      return () => element.replaceChildren();
    },
  } as unknown as MarkdownRenderService;
}

async function mountWithTick(toggle: (item: TaskItem) => AsyncResult<void, TickError>): Promise<TestHarness> {
  return testContainer({
    modules: [tasksCoreModule],
    overrides: [
      overrideWith(MarkdownRenderService, stubMarkdown()),
      overrideWith(TickService, { toggle } as unknown as TickService),
    ],
  });
}

// Real Obsidian renders an enabled checkbox for a task line with no handler of its own attached
// outside a real MarkdownView (measured against 1.13.7), which is what licenses catching its click
// here. The unit-test-tier FakeMarkdownRenderService is `element.textContent = markdown` and
// produces no such input, so these tests attach a plain `<input type="checkbox">` by hand and click
// it — exercising the click-delegation and context guard for real, but not whether
// MarkdownRenderService's actual output matches what we insert by hand. That last gap is covered by
// the tasks e2e journey.
// `disabled` is a reflected boolean attribute, so this reads back what the component set on the
// rendered input without an instanceof narrowing per row.
function disabledFlags(): boolean[] {
  return screen.getAllByRole("checkbox").map((box) => box.hasAttribute("disabled"));
}

function clickableCheckbox(markdown: string): HTMLInputElement {
  const line = screen.getByText(markdown);
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  line.append(checkbox);
  return checkbox;
}

describe("TaskList", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [tasksCoreModule],
      overrides: [overrideWith(MarkdownRenderService, stubMarkdown())],
    });
  });

  it("renders each row's whole line, marker included, so a theme can style the status", () => {
    harness.render(TaskList, { props: { rows: [row({ markdown: "- [/] Ship it 📅 2026-09-25" })] } });
    expect(screen.getByText("- [/] Ship it 📅 2026-09-25")).toBeTruthy();
  });

  // Hydration reads a task's lines verbatim out of the note, indentation included, so a nested
  // line arrives carrying the tab it is written with. Handed to the renderer as-is it is an
  // indented code block, which has no checkbox and no `data-task` for a theme to style.
  it("strips a nested line's own indentation, so the renderer cannot read it as a code block", () => {
    harness.render(TaskList, {
      props: { rows: [row({ depth: 1, markdown: "\t- [ ] Write the changelog entry" })] },
    });
    const line = screen.getByRole("listitem").querySelector(".task-listing-row__line");
    expect(line?.textContent).toBe("- [ ] Write the changelog entry");
  });

  it("indents a nested row by its depth", () => {
    harness.render(TaskList, { props: { rows: [row({ depth: 0 }), row({ depth: 1, markdown: "- [ ] Child" })] } });
    const child = screen.getByText("- [ ] Child").closest("[data-depth]");
    expect(child instanceof HTMLElement && child.dataset.depth).toBe("1");
  });

  it("marks a context row so it renders dimmed and cannot be ticked", () => {
    harness.render(TaskList, { props: { rows: [row({ context: true })] } });
    expect(screen.getByRole("listitem").dataset.context).toBe("true");
  });

  // The click handler already refuses a context row, but an enabled, focusable control that does
  // nothing when pressed is an affordance the behavior does not back.
  it("disables a context row's own checkbox, so the control matches what clicking it does", async () => {
    harness = await testContainer({
      modules: [tasksCoreModule],
      overrides: [overrideWith(MarkdownRenderService, checkboxMarkdown())],
    });
    const plain = row({ context: false, line: 4 });
    const { rerender } = harness.render(TaskList, {
      props: { rows: [row({ context: true, line: 3 }), plain] },
    });

    expect(disabledFlags()).toEqual([true, false]);

    // Hydration replaces a row's markdown under the same key, and Obsidian's renderer replaces the
    // input along with it — so the row that was already disabled has to come back disabled.
    await rerender({ rows: [row({ context: true, line: 3, markdown: "- [x] Shopping" }), plain] });
    expect(disabledFlags()).toEqual([true, false]);
  });

  it("links each row to the note it came from", () => {
    harness.render(TaskList, { props: { rows: [row({ sourceLabel: "2026-09-22" })] } });
    expect(screen.getByRole("link", { name: "2026-09-22" })).toBeTruthy();
  });

  it("shows the empty message when the query matched nothing", () => {
    harness.render(TaskList, { props: { rows: [] } });
    expect(screen.getByText(m.tasks_listing_empty())).toBeTruthy();
  });

  describe("ticking", () => {
    it("reaches TickService with the row's own item when its checkbox is clicked", async () => {
      const toggle = vi.fn(() => AsyncResult.ok<void>(undefined));
      const target = row({ markdown: "- [ ] Ship it" });
      harness = await mountWithTick(toggle);
      harness.render(TaskList, { props: { rows: [target] } });

      const checkbox = clickableCheckbox("- [ ] Ship it");
      checkbox.click();

      await vi.waitFor(() => expect(toggle).toHaveBeenCalledTimes(1));
      expect(toggle).toHaveBeenCalledWith(target.item);
    });

    it("refuses to tick a context row even though its checkbox is clicked", async () => {
      const toggle = vi.fn(() => AsyncResult.ok<void>(undefined));
      const target = row({ markdown: "- [ ] Ship it", context: true });
      harness = await mountWithTick(toggle);
      harness.render(TaskList, { props: { rows: [target] } });

      const checkbox = clickableCheckbox("- [ ] Ship it");
      checkbox.click();

      // There is no async completion to await for a call that never happens, so this asserts the
      // synchronous state right after the click rather than racing a `waitFor` that would always
      // time out toward the same answer.
      expect(toggle).not.toHaveBeenCalled();
    });

    it("shows a generic notice when ticking fails for a reason the service has not already announced", async () => {
      const path = "Daily/2026-09-22.md" as VaultPath;
      const toggle = vi.fn(() => AsyncResult.err<TickError>(new NotATaskLineError(path)));
      const target = row({ markdown: "- [ ] Ship it" });
      harness = await mountWithTick(toggle);
      harness.render(TaskList, { props: { rows: [target] } });

      clickableCheckbox("- [ ] Ship it").click();

      await vi.waitFor(() => expect(harness.notices.messages).toContain(m.tasks_tick_error()));
    });

    it("stays silent when ticking refuses for a benign reason TickService already announced itself", async () => {
      const path = "Daily/2026-09-22.md" as VaultPath;
      const toggle = vi.fn(() => AsyncResult.err<TickError>(new RecurringUnsupportedError(path)));
      const target = row({ markdown: "- [ ] Ship it" });
      harness = await mountWithTick(toggle);
      harness.render(TaskList, { props: { rows: [target] } });

      clickableCheckbox("- [ ] Ship it").click();

      await vi.waitFor(() => expect(toggle).toHaveBeenCalledTimes(1));
      expect(harness.notices.messages).toEqual([]);
    });
  });

  describe("task notes", () => {
    it("renders an open task note as an open checkbox and a link titled by the note", async () => {
      ({ harness } = await mountNotes());
      harness.render(TaskList, { props: { rows: [noteRow({ status: "todo" })] } });

      expect(renderedCheckbox().checked).toBe(false);
      const link = internalLink();
      expect(link?.textContent).toBe("Ship it");
      expect(link?.dataset.href).toBe("Tasks/Ship it");
    });

    it("names the task note once, with no source link repeating its title", async () => {
      ({ harness } = await mountNotes());
      harness.render(TaskList, { props: { rows: [noteRow()] } });

      expect(screen.queryAllByRole("link")).toEqual([]);
      expect(screen.getAllByText("Ship it")).toHaveLength(1);
    });

    it("renders a done task note as a ticked checkbox", async () => {
      ({ harness } = await mountNotes());
      harness.render(TaskList, { props: { rows: [noteRow({ status: "done" })] } });

      expect(renderedCheckbox().checked).toBe(true);
    });

    it.each([
      ["a closing bracket pair", "Fix [[x]] parsing"],
      ["a trailing bracket", "Tag [a]"],
      ["a pipe", "This | that"],
    ])("keeps a title carrying %s whole inside its link", async (_label, title) => {
      ({ harness } = await mountNotes());
      harness.render(TaskList, { props: { rows: [noteRow({ title })] } });

      const link = internalLink();
      expect(link?.dataset.href).toBe("Tasks/Ship it");
      expect(link?.textContent?.replaceAll("\u{200B}", "")).toBe(title);
    });

    it("reaches TickService with the task note's item when its checkbox is clicked", async () => {
      const mounted = await mountNotes();
      ({ harness } = mounted);
      const { toggle } = mounted;
      const target = noteRow();
      harness.render(TaskList, { props: { rows: [target] } });

      renderedCheckbox().click();

      await vi.waitFor(() => expect(toggle).toHaveBeenCalledTimes(1));
      expect(toggle).toHaveBeenCalledWith(target.item);
    });

    it("opens the task note when its link is clicked", async () => {
      const mounted = await mountNotes();
      ({ harness } = mounted);
      const { toggle, workspace } = mounted;
      harness.render(TaskList, { props: { rows: [noteRow()] } });

      screen.getByText("Ship it", { selector: "a.internal-link" }).click();

      await vi.waitFor(() => expect(workspace.isOpen(TASK_NOTE)).toBe(true));
      expect(toggle).not.toHaveBeenCalled();
    });
  });
});
