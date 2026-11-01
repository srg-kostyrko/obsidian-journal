import { $$, browser, expect } from "@wdio/globals";

import { readRawSettings, writeRawSettings } from "../support/plugin-data.js";
import { triggerExternalSettingsChange } from "../support/plugin.js";

import { openInReadingMode } from "./code-blocks.js";
import { TASK_ROWS, taskRowCheckbox, waitForTaskRowMatching } from "./tasks.js";

// A listing filter edit turns a context row into a matching one under the same key and with the
// same markdown, so nothing re-renders the row's checkbox: only the row itself can re-enable it.
const FIXTURE = "./e2e-tests/fixtures/e2e-tasks-context-flip";
const DAY_NOTE = "daily/2026-09-25.md";

async function showEveryStatus(): Promise<void> {
  const raw = await readRawSettings();
  const stored = JSON.parse(raw ?? "{}") as { journals: { daily: Record<string, unknown> } };
  stored.journals.daily.tasks = {
    filter: { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["all"] }] },
  };
  await writeRawSettings(JSON.stringify(stored));
  await triggerExternalSettingsChange();
}

describe("a listing row that stops being context", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });

  it("re-enables its checkbox once the filter matches it", async () => {
    await openInReadingMode(DAY_NOTE);
    await expect($$(TASK_ROWS)).toBeElementsArrayOfSize(6);
    await expect(await taskRowCheckbox("Groceries run")).toBeDisabled();

    await showEveryStatus();
    await waitForTaskRowMatching("Groceries run");

    await expect(await taskRowCheckbox("Groceries run")).toBeEnabled();
  });
});
