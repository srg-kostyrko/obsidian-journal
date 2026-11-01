import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { readRawSettings, waitForSettingsVersion } from "../support/plugin-data.js";
import { clickIcon, closeSettings, expandSection, openSettings, toggleSettingRow } from "../support/settings.js";

import { VISIBLE_LEAF, openInReadingMode } from "./code-blocks.js";

// What the plugin does with a tasks value it cannot read, against real Obsidian: a fence shows an
// error, a stored setting matches nothing, and saving settings writes the stored value back as it was.
const FIXTURE = "./e2e-tests/fixtures/e2e-tasks-unreadable";
const LISTED_NOTE = "daily/2026-09-25.md";
const TYPO_NOTE = "daily/2026-09-26.md";
const STORED_CONDITION = { type: "priority", above: 2 };

const TASKS_BLOCK = `${VISIBLE_LEAF} .markdown-reading-view .block-language-journal-tasks`;

describe("tasks values the plugin cannot read", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: FIXTURE, plugins: ["journals"] });
  });

  after(closeSettings);

  it("shows an error naming a fence value it does not know, rather than listing by a default", async () => {
    await openInReadingMode(TYPO_NOTE);

    const error = $(`${TASKS_BLOCK} .code-block-error`);
    await expect(error).toHaveText(expect.stringContaining(m.code_blocks_schema_error({ key: "journal-tasks" })));
    await expect(error).toHaveText(expect.stringContaining("source"));
    await expect($$(`${TASKS_BLOCK} .task-listing-row`)).toBeElementsArrayOfSize(0);
  });

  // Dropping the condition would leave the filter empty, and list both tasks.
  it("lists nothing under a listing filter condition it cannot read", async () => {
    await openInReadingMode(LISTED_NOTE);

    await expect($(`${TASKS_BLOCK} .task-listing__empty`)).toHaveText(m.tasks_listing_empty());
    await expect($$(`${TASKS_BLOCK} .task-listing-row`)).toBeElementsArrayOfSize(0);
  });

  it("writes the condition back as it was stored when settings are saved", async () => {
    await openSettings();
    await expandSection(m.view_dashboard_section_title());
    await clickIcon(m.view_dashboard_open({ name: "Calendar" }));
    await toggleSettingRow(m.view_edit_remember_date_label());
    await waitForSettingsVersion();

    const raw = await readRawSettings();
    expect(raw).toBeDefined();
    const stored = JSON.parse(raw ?? "{}") as {
      journals: { daily: { tasks: { filter: { conditions: unknown[] } } } };
    };
    expect(stored.journals.daily.tasks.filter.conditions).toEqual([STORED_CONDITION]);
  });
});
