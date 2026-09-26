import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { contentOf, waitForContent } from "../support/vault.js";

import { VISIBLE_LEAF, openInReadingMode } from "./code-blocks.js";

// The journal-tasks fence's own seam: real MarkdownRenderer output for a task line, and a real
// checkbox click reaching our delegated handler (task-row-click.ts) rather than the unit suite's
// injected <input>. Neither can be reproduced against the Obsidian fake.
const FIXTURE = "./e2e-tests/fixtures/e2e-tasks-listing";

// Ships baked into the fixture rather than via seedNote: a note that has to exist at boot cannot
// be staged by seed-then-reload, which does not survive browser.reloadObsidian (CLAUDE.md).
const DAY_NOTE = "daily/2026-09-25.md";
const PLAIN_NOTE = "plain.md";

// A markdown leaf keeps a live-preview copy and a reading-view copy of the same note mounted at
// once, so an unscoped selector matches every fence twice. Each test also opens the note in a
// fresh tab (openInReadingMode's getLeaf(true)), and Obsidian keeps earlier tabs' leaves in the
// DOM hidden via inline display:none — so the reading-view scope alone is not enough either; it
// has to be paired with VISIBLE_LEAF or a stale prior render of the same note answers instead.
const TASKS_BLOCK = `${VISIBLE_LEAF} .markdown-reading-view .block-language-journal-tasks`;
const TASK_ROWS = `${TASKS_BLOCK} .task-listing-row`;
const NOT_CONNECTED = `${TASKS_BLOCK} .journal-tasks-not-connected`;

// contentOf resolves to undefined for a missing file; every call site here expects the fixture
// note to exist, so a missing note fails loudly here rather than comparing against "".
async function readNote(path: string): Promise<string> {
  const content = await contentOf(path);
  expect(content).toBeDefined();
  return content ?? "";
}

// Proves the note changed by exactly one character on exactly one line — the shape a
// status-character tick is supposed to have (tick.ts's own unit tests assert prefix/marker/suffix
// separately for the same reason). A `toContain` check on the after-content alone would still pass
// if an untouched line picked up trailing whitespace or a trailing signifier, which is exactly what
// "overwrite only tokens we found" exists to rule out — see tickLine's own doc comment. Returns the
// one changed line's before/after text so the caller can pin exactly what changed.
function assertSingleCharacterEdit(before: string, after: string): { before: string; after: string } {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  expect(afterLines).toHaveLength(beforeLines.length);

  const changedIndices = beforeLines.flatMap((line, index) => (line === afterLines[index] ? [] : [index]));
  expect(changedIndices).toHaveLength(1);
  const index = changedIndices[0];
  const beforeLine = beforeLines[index] ?? "";
  const afterLine = afterLines[index] ?? "";

  // Compared as code points on both sides, not as UTF-16 code units: a task line can carry a
  // surrogate-pair emoji (e.g. the 📅 due-date signifier), which spreads as one element but is two
  // `string[i]` code units — indexing beforeChars[i] against a raw afterLine[i] puts every
  // position from the emoji onward out of step and reports a spurious multi-character diff.
  const beforeChars = [...beforeLine];
  const afterChars = [...afterLine];
  expect(afterChars).toHaveLength(beforeChars.length);

  const changedPositions = beforeChars.flatMap((char, i) => (char === afterChars[i] ? [] : [i]));
  expect(changedPositions).toHaveLength(1);
  const position = changedPositions[0];
  expect(afterChars.slice(0, position)).toEqual(beforeChars.slice(0, position));
  expect(afterChars.slice(position + 1)).toEqual(beforeChars.slice(position + 1));

  return { before: beforeLine, after: afterLine };
}

describe("journal-tasks fence", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });

  it("lists the day note's open items and leaves its done one out", async () => {
    await openInReadingMode(DAY_NOTE);

    // The listing builds asynchronously (TaskIndex.hydrate), so the row count settles after the
    // block first mounts rather than in the same tick as openInReadingMode's resolve.
    // toBeElementsArrayOfSize auto-retries, unlike a one-shot $$().length read.
    await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(2);

    const texts = await $$(TASK_ROWS).map((row) => row.$(".task-listing-row__line").getText());
    expect(texts[0]).toContain("Ship it");
    expect(texts[1]).toContain("Write the spec");
    // The done item ("Buy milk") is excluded by the listing's default status filter (open only,
    // applied because neither this fence nor the journal names a status), not merely absent from the
    // two rows this asserts on by position.
    expect(texts.some((text) => text.includes("Buy milk"))).toBe(false);
  });

  it("renders the not-connected message in a note no journal owns", async () => {
    await openInReadingMode(PLAIN_NOTE);
    // Not an empty listing (m.tasks_listing_empty()), which would read as "you have no tasks" —
    // this note is not connected to any journal at all.
    await expect($(NOT_CONNECTED)).toHaveText(m.code_blocks_tasks_not_connected());
  });

  it("ticking a row writes the status character into the source note, leaving the other line untouched", async () => {
    await openInReadingMode(DAY_NOTE);
    await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(2);

    const before = await readNote(DAY_NOTE);

    // Selected by its rendered text, not by position: the row's index depends on the listing's
    // sort, which is not this test's concern. An index-based pick would silently start ticking a
    // different row the day that sort changes, turning this spec into a confusing failure in an
    // unrelated area instead of a clear one.
    const texts = await $$(TASK_ROWS).map((row) => row.$(".task-listing-row__line").getText());
    const shipItIndex = texts.findIndex((text) => text.includes("Ship it"));
    expect(shipItIndex).toBeGreaterThanOrEqual(0);
    await $$(TASK_ROWS)[shipItIndex].$("input[type=checkbox]").click();

    await waitForContent(
      DAY_NOTE,
      (content) => content.includes("- [x] Ship it"),
      "waited for ticking 'Ship it' to write 'x' into the note",
    );

    // Asserted by reading the note back, never by the listing's own state — the listing can show
    // a ticked row from its in-memory item while the write silently failed.
    const after = await readNote(DAY_NOTE);
    const edit = assertSingleCharacterEdit(before, after);
    expect(edit.before).toBe("- [ ] Ship it 📅 2026-09-25");
    expect(edit.after).toBe("- [x] Ship it 📅 2026-09-25");

    // The other open line equals its original text exactly — "overwrite only tokens we found" in
    // practice, not a substring check that a trailing whitespace or signifier corruption would
    // also pass. assertSingleCharacterEdit already proved every line but the one above is
    // untouched; this pins what that one actually reads.
    const afterLines = after.split("\n");
    expect(afterLines.find((line) => line.includes("Write the spec"))).toBe("- [/] Write the spec");
  });

  // The one thing only e2e can establish: the fence renders each row through Obsidian's own
  // MarkdownRenderer and then delegates a click on the checkbox it produced (checkboxTarget in
  // task-row-click.ts). TaskRow.test.ts and task-row-click.test.ts inject their own <input> into
  // the rendered container, which proves the delegation logic works against a realistic DOM shape
  // — never that Obsidian's own embedded rendering actually puts a checkbox inside that
  // click-handled subtree, unwrapped by anything that stops propagation first. Only a click on the
  // real rendered checkbox settles that.
  it("reaches the delegated handler through a click on Obsidian's own rendered checkbox", async () => {
    await openInReadingMode(DAY_NOTE);
    // After the previous test, "Ship it" and "Buy milk" are both done, leaving "Write the spec" as
    // the sole open row — the one this test clicks.
    await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(1);

    const before = await readNote(DAY_NOTE);
    const checkbox = $(`${TASK_ROWS} input[type=checkbox]`);
    // Obsidian attaches no handler of its own to a checkbox rendered through the static
    // MarkdownRenderer.render() API — it is a plain, enabled control, matching task-row-click.ts's
    // own comment. A disabled checkbox here would mean that comment no longer holds.
    await expect(checkbox).toBeEnabled();
    await checkbox.click();

    await waitForContent(
      DAY_NOTE,
      (content) => content.includes("- [x] Write the spec"),
      "waited for a click on the real rendered checkbox to reach the delegated handler and tick the note",
    );

    const after = await readNote(DAY_NOTE);
    const edit = assertSingleCharacterEdit(before, after);
    expect(edit.before).toBe("- [/] Write the spec");
    expect(edit.after).toBe("- [x] Write the spec");
  });
});
