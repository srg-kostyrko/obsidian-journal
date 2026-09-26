import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { MarkdownRenderService, type VaultPath } from "@/infrastructure/host";
import { FakeMarkdownRenderService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { tasksCoreModule } from "../module";
import { buildTaskItem } from "../testing";
import { NotATaskLineError, RecurringUnsupportedError, TickService, type TickError } from "../tick";

import TaskList from "./TaskList.vue";

import type { TaskListingRow } from "../listing";
import type { TaskItem } from "../types";

function row(
  overrides: {
    markdown?: string;
    depth?: number;
    context?: boolean;
    sourceLabel?: string;
  } = {},
): TaskListingRow {
  const item: TaskItem = buildTaskItem({
    display: {
      kind: "line",
      path: "Daily/2026-09-22.md" as VaultPath,
      line: 0,
      endLine: 0,
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

function stubMarkdown(): MarkdownRenderService {
  return new FakeMarkdownRenderService() as unknown as MarkdownRenderService;
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
// outside a real MarkdownView (measured against 1.13.7 — see the tasks-listing spec's Task 0),
// which is what licenses catching its click here. The unit-test-tier FakeMarkdownRenderService is
// `element.textContent = markdown` and produces no such input, so these tests attach a plain
// `<input type="checkbox">` by hand and click it — exercising the click-delegation and context
// guard for real, but not whether MarkdownRenderService's actual output matches what we insert by
// hand. That last gap is Task 16's e2e spec.
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

  it("indents a nested row by its depth", () => {
    harness.render(TaskList, { props: { rows: [row({ depth: 0 }), row({ depth: 1, markdown: "- [ ] Child" })] } });
    const child = screen.getByText("- [ ] Child").closest("[data-depth]");
    expect(child instanceof HTMLElement && child.dataset.depth).toBe("1");
  });

  it("marks a context row so it renders dimmed and cannot be ticked", () => {
    harness.render(TaskList, { props: { rows: [row({ context: true })] } });
    expect(screen.getByRole("listitem").dataset.context).toBe("true");
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
});
