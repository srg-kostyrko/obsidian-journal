import { $$, browser } from "@wdio/globals";

import { waitForState } from "./wait.js";

// Obsidian renders every Notice into a shared `.notice-container`; the text is the only thing
// the plugin controls, so match on it rather than on a per-notice handle.
export async function noticeTexts(): Promise<string[]> {
  return $$(".notice-container .notice").map(async (notice) => notice.getText());
}

export async function waitForNotice(text: string): Promise<void> {
  await waitForState(noticeTexts, (texts) => texts.includes(text), `no notice read "${text}"`);
}

// A Notice fades IN on creation, and WebDriver's getText() reads an opacity:0 element as empty
// text, so a check made the instant the element appears can catch it mid-fade. Wait for a
// non-empty reading rather than mere existence, then report whatever text is there (possibly
// none, if nothing rendered within the bound).
export async function waitForNoticeText(timeout: number): Promise<string[]> {
  try {
    await browser.waitUntil(
      async () => {
        const texts = await noticeTexts();
        return texts.some((text) => text.trim() !== "");
      },
      { timeout, interval: 100 },
    );
  } catch {
    // No notice rendered within the bound; fall through and report whatever is there (nothing).
  }
  const texts = await noticeTexts();
  return texts.filter((text) => text.trim() !== "");
}
