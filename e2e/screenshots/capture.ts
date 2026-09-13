import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { $, browser } from "@wdio/globals";

const ASSETS = "./docs/user/public/assets";
const OUTCOMES = "./e2e/.reports/outcomes";

const THEMES = [
  { id: "moonstone", bodyClass: "theme-light", suffix: "light" },
  { id: "obsidian", bodyClass: "theme-dark", suffix: "dark" },
] as const;

/** Save an element screenshot of `selector` in each Obsidian theme. */
export async function captureThemed(selector: string, name: string): Promise<void> {
  // The `git rm` of the three 2023 PNGs left this directory with no tracked files, and git
  // does not keep empty directories, so a clean checkout has none here for saveScreenshot to
  // write into.
  await mkdir(ASSETS, { recursive: true });
  // A screenshot taken while `selector`'s element is mid-layout (width 0) does not just fail that
  // one capture: chromedriver's element-screenshot command wedges for the rest of the session —
  // "Cannot take screenshot with 0 width", then every later screenshot command times out and
  // never recovers. A single non-zero clientWidth reading is not enough to trust either, since
  // changeTheme's re-layout can leave the width flickering for a stretch — require several
  // consecutive non-zero readings before trusting it has settled.
  const waitForStableLayout = async (): Promise<void> => {
    let consecutive = 0;
    await browser.waitUntil(
      async () => {
        const width = await browser.execute(
          (sel: string) => document.querySelector<HTMLElement>(sel)?.clientWidth ?? 0,
          selector,
        );
        consecutive = width > 0 ? consecutive + 1 : 0;
        return consecutive >= 3;
      },
      { timeoutMsg: `${selector} never settled on a laid-out width`, interval: 100 },
    );
  };
  await waitForStableLayout();
  for (const theme of THEMES) {
    await browser.executeObsidian(({ app }, id) => {
      // Undocumented: sets the vault's `theme` config and restyles live, as the appearance tab does.
      (app as unknown as { changeTheme(themeId: string): void }).changeTheme(id);
    }, theme.id);
    await browser.waitUntil(
      async () => browser.execute((cls: string) => document.body.classList.contains(cls), theme.bodyClass),
      { timeoutMsg: `Obsidian theme ${theme.id} was never applied` },
    );
    // changeTheme also collapses the block's width for a moment while it re-lays-out under the
    // new theme's CSS, so re-check layout here too, not only before the loop.
    await waitForStableLayout();
    // changeTheme also suspends CSS transitions for 200 ms; a capture inside that window catches
    // half-applied colors. An async browser.execute() waiting on requestAnimationFrame does not
    // reliably resolve here — observed as a genuine 30s "script timeout" on execute/sync, rAF
    // apparently never firing in this harness — so wait on the Node side instead of asking the
    // page to schedule anything.
    await browser.pause(250);
    await $(selector).saveScreenshot(path.join(ASSETS, `${name}-${theme.suffix}.png`));
  }
}

/** Write what an example actually did, for comparison with what its page claims. */
export async function recordOutcome(name: string, outcome: unknown): Promise<void> {
  await mkdir(OUTCOMES, { recursive: true });
  await writeFile(path.join(OUTCOMES, `${name}.json`), `${JSON.stringify(outcome, null, 2)}\n`);
}
