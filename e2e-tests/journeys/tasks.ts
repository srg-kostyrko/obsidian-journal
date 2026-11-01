import { $$, browser } from "@wdio/globals";

import { TaskRowMissingError } from "../support/errors.js";

import { VISIBLE_LEAF } from "./code-blocks.js";

export const TASK_ROWS = `${VISIBLE_LEAF} .markdown-reading-view .block-language-journal-tasks .task-listing-row`;

async function rowContaining(fragment: string) {
  const rows = $$(TASK_ROWS);
  const texts = await rows.map((row) => row.$(".task-listing-row__line").getText());
  const index = texts.findIndex((text) => text.includes(fragment));
  return index === -1 ? undefined : rows[index];
}

/** The checkbox of the listing row whose line text contains `fragment`. */
export async function taskRowCheckbox(fragment: string) {
  const row = await rowContaining(fragment);
  if (row === undefined) throw new TaskRowMissingError(fragment);
  return row.$("input[type=checkbox]");
}

/** Waits until the row whose line text contains `fragment` is no longer drawn as context. */
export async function waitForTaskRowMatching(fragment: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      const row = await rowContaining(fragment);
      return row !== undefined && (await row.getAttribute("data-context")) !== "true";
    },
    { timeoutMsg: `waited for the "${fragment}" row to match the listing filter` },
  );
}
