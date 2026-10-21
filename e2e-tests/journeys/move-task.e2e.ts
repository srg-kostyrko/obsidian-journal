import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { runCommand } from "../support/commands.js";
import { waitForNotice } from "../support/notices.js";
import { contentOf, openNote, waitForActiveNote, waitForContent } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

// The single move's real-vault seams: the source rewritten through the active editor, the target
// through the other pane that holds it with unsaved typing. Both notes ship in the
// fixture so their metadata has resolved before the command runs. No clock pin: the containing
// period comes from the source note's own date, never from today.
const FIXTURE = "./e2e-tests/fixtures/e2e-move-task";
const SOURCE = "daily/2026-09-25.md";
const TARGET = "monthly/2026-09.md";
const TARGET_LABEL = "September 2026";
const UNSAVED = "Month goals, revised.";
// Typed on the empty last line, so the buffer ends without a newline: a write that bypassed the view
// ran the moved lines onto the end of it.
const TYPED_AT_END = "Not saved yet.";

class NoteMissingError extends Error {
  constructor(path: string) {
    super(`expected ${path} to exist`);
    this.name = "NoteMissingError";
  }
}

// WebDriver serializes a missing note's undefined as null, so the guard has to reject both.
async function readNote(path: string): Promise<string> {
  const content = await contentOf(path);
  if (content === undefined || content === null) throw new NoteMissingError(path);
  return content;
}

function openViewText(path: string): Promise<string | undefined> {
  return browser.executeObsidian(({ app, obsidian }, notePath) => {
    for (const leaf of app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof obsidian.MarkdownView && view.file?.path === notePath) return view.editor.getValue();
    }
    return;
  }, path);
}

class StagingError extends Error {
  constructor(step: string) {
    super(`could not stage the split: ${step}`);
    this.name = "StagingError";
  }
}

type Typing = "retype-body" | "append-at-end";

// The target goes in a split and gets unsaved typing — its body line retyped, or a line typed at its
// very end; the source then takes the other pane and the cursor lands on the child task. The browser
// side reports a failed step by name, since a class defined here does not exist in the page.
async function stageSplit(typing: Typing): Promise<void> {
  await openNote(TARGET);
  await waitForActiveNote(TARGET);
  const opened = await browser.executeObsidian(
    async ({ app, obsidian }, sourcePath, targetPath, unsaved, typedAtEnd, how) => {
      const target = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (target?.file?.path !== targetPath) return "target not active";
      const file = app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof obsidian.TFile)) return "source missing";
      const leaf = app.workspace.getLeaf("split");
      await leaf.openFile(file, { active: true });
      const editor = target.editor;
      if (how === "append-at-end") {
        const last = editor.lastLine();
        if (editor.getLine(last) !== "") return "target does not end with a newline";
        editor.replaceRange(typedAtEnd, { line: last, ch: 0 });
        return "ok";
      }
      const line = editor.getValue().split("\n").indexOf("Month goals.");
      editor.replaceRange(unsaved, { line, ch: 0 }, { line, ch: editor.getLine(line).length });
      return "ok";
    },
    SOURCE,
    TARGET,
    UNSAVED,
    TYPED_AT_END,
    typing,
  );
  if (opened !== "ok") throw new StagingError(opened);
  await waitForActiveNote(SOURCE);
  const placed = await browser.executeObsidian(({ app }) => {
    const editor = app.workspace.activeEditor?.editor;
    if (editor === undefined) return false;
    const line = editor
      .getValue()
      .split("\n")
      .findIndex((text) => text.includes("draft outline"));
    editor.setCursor({ line, ch: 3 });
    return true;
  });
  if (!placed) throw new StagingError("no active editor");
}

const DONE_NOTICE = (): string =>
  m.tasks_move_done({
    mode: "copy",
    target: m.tasks_move_target_row({
      label: TARGET_LABEL,
      journal: "",
      notelet: "",
      hasJournal: "no",
      hasNotelet: "no",
    }),
  });

describe("moving one task to its containing period", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });

  it("copies the child under its parent into the month note, which an open pane shows, and marks the original", async () => {
    await stageSplit("retype-body");
    const before = await readNote(TARGET);
    // Still on disk as shipped: the pane's edit has not saved, so the write meets unsaved typing.
    expect(before).toContain("Month goals.");
    expect(before).not.toContain(UNSAVED);

    await runCommand("journals:move-task-to-containing-period");

    await waitForNotice(DONE_NOTICE());
    await waitForContent(
      SOURCE,
      (content) => content.includes("\t- [ ] draft outline #rolled"),
      "waited for the source stamp",
    );

    const targetNote = await readNote(TARGET);
    const targetLines = targetNote.split("\n");
    expect(targetLines).toContain("- [ ] launch project");
    expect(targetLines).toContain("\t- [ ] draft outline");
    expect(targetLines.indexOf("\t- [ ] draft outline")).toBe(targetLines.indexOf("- [ ] launch project") + 1);
    expect(targetNote).not.toContain("book room");
    expect(targetNote).not.toContain("groceries");

    await waitForState(
      () => openViewText(TARGET),
      (text) => text.includes("\t- [ ] draft outline") && text.includes(UNSAVED),
      "waited for the open month pane to show the copied task beside the unsaved line",
    );

    const sourceNote = await readNote(SOURCE);
    const sourceLines = sourceNote.split("\n");
    expect(sourceLines).toContain("- [ ] launch project");
    expect(sourceLines).toContain("\t- [ ] book room");
    expect(sourceLines).toContain("- [ ] groceries");
  });

  it("lands on its own lines after typing the open month pane has not saved at its very end", async () => {
    await stageSplit("append-at-end");
    expect(await readNote(TARGET)).not.toContain(TYPED_AT_END);

    await runCommand("journals:move-task-to-containing-period");

    await waitForNotice(DONE_NOTICE());
    await waitForState(
      () => openViewText(TARGET),
      (text) => text.includes("\t- [ ] draft outline"),
      "waited for the open month pane to show the copied task",
    );
    const viewText = (await openViewText(TARGET)) ?? "";
    for (const text of [viewText, await readNote(TARGET)]) {
      const lines = text.split("\n");
      expect(lines).toContain(TYPED_AT_END);
      expect(lines.indexOf("- [ ] launch project")).toBe(lines.indexOf(TYPED_AT_END) + 1);
      expect(lines.indexOf("\t- [ ] draft outline")).toBe(lines.indexOf("- [ ] launch project") + 1);
    }
    await waitForContent(
      SOURCE,
      (content) => content.includes("\t- [ ] draft outline #rolled"),
      "waited for the source stamp",
    );
  });
});
