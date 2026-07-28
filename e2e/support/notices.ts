import { $$ } from "@wdio/globals";

import { waitForState } from "./wait.js";

// Obsidian renders every Notice into a shared `.notice-container`; the text is the only thing
// the plugin controls, so match on it rather than on a per-notice handle.
async function noticeTexts(): Promise<string[]> {
  return $$(".notice-container .notice").map(async (notice) => notice.getText());
}

export async function waitForNotice(text: string): Promise<void> {
  await waitForState(noticeTexts, (texts) => texts.includes(text), `no notice read "${text}"`);
}
