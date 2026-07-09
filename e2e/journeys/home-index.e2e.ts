import { browser } from "@wdio/globals";

import { HOME_BLOCK, plainNote, renderBlock } from "./code-blocks.js";

// The home block lists the current custom-interval note as a link whose label is the journal's
// `Sprint {{index}}` name template. Before the fix it resolved the path from bare metadata (no
// computed numbers), so `{{index}}` stayed unbound and the link showed the raw token. The index
// tracks the current date, so the guard is that it resolves to a number, not a specific one.
const HOME_CUSTOM_FENCE = "```journals-home\nshow: [custom]\n```";
const HOME_LINK = `${HOME_BLOCK} a`;

async function homeLinkText(): Promise<string> {
  return browser.execute((sel: string) => document.querySelector(sel)?.textContent?.trim() ?? "", HOME_LINK);
}

describe("home code block custom index", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-sprint-index", plugins: ["journals"] });
    await renderBlock("blocks/home-custom.md", plainNote(HOME_CUSTOM_FENCE), HOME_LINK);
  });

  it("resolves the index for the current custom interval", async () => {
    await browser.waitUntil(async () => /^Sprint \d+$/.test(await homeLinkText()), {
      timeoutMsg: "home block did not resolve the custom interval index (expected 'Sprint <n>')",
    });
  });
});
