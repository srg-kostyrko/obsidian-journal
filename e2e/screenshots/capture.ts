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
  // saveScreenshot does not create directories.
  await mkdir(ASSETS, { recursive: true });
  // A zero-width element cannot be captured, so wait for a stable, non-zero box.
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
    // changeTheme suspends CSS transitions for 200 ms.
    await browser.pause(250);
    await $(selector).saveScreenshot(path.join(ASSETS, `${name}-${theme.suffix}.png`));
  }
}

/** Write what an example actually did, for comparison with what its page claims. */
export async function recordOutcome(name: string, outcome: unknown): Promise<void> {
  await mkdir(OUTCOMES, { recursive: true });
  await writeFile(path.join(OUTCOMES, `${name}.json`), `${JSON.stringify(outcome, null, 2)}\n`);
}
