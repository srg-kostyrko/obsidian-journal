import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { browser } from "@wdio/globals";

import { waitForState } from "../support/wait.js";

const ASSETS = "./docs/user/public/assets";
const OUTCOMES = "./e2e-tests/.reports/outcomes";
const CAPTURE_TIMEOUT_MS = 8000;

const THEMES = [
  { id: "moonstone", bodyClass: "theme-light", suffix: "light" },
  { id: "obsidian", bodyClass: "theme-dark", suffix: "dark" },
] as const;

interface CaptureOptions {
  /** CSS pixels of surrounding window to include on every side, clamped to the viewport. */
  padding?: number;
}

interface CaptureReply {
  data?: string;
  error?: string;
}

interface CapturedImage {
  toPNG(): { toString(encoding: "base64"): string };
}

interface ElectronHost {
  electron?: { remote?: { getCurrentWebContents(): { capturePage(rect: object): Promise<CapturedImage> } } };
}

class CaptureFailedError extends Error {
  constructor(selector: string, reason: string) {
    super(`capture of ${selector} failed: ${reason}`);
    this.name = "CaptureFailedError";
  }
}

// A zero-width element cannot be captured, so wait for a stable, non-zero box.
async function waitForStableLayout(selector: string): Promise<void> {
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
}

/** Save a screenshot of `selector`'s box to `file` once its layout has settled. */
export async function saveElementScreenshot(
  selector: string,
  file: string,
  options: CaptureOptions = {},
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await waitForStableLayout(selector);
  // Not chromedriver's screenshot (`$().saveScreenshot`, `browser.takeScreenshot`, or CDP
  // `Page.captureScreenshot`): against Obsidian's window it waits for a freshly presented frame
  // that often never comes, so it hangs for good, or its retry hands back the window's top-left
  // corner at the element's size. Electron's capturePage copies the surface as last drawn. The
  // in-page timeout turns a stall into a failed test rather than a wedged WebDriver session.
  const reply = await browser.execute(
    async (sel: string, padding: number, timeoutMs: number): Promise<CaptureReply> => {
      const box = document.querySelector(sel)?.getBoundingClientRect();
      const remote = (window as unknown as ElectronHost).electron?.remote;
      if (box === undefined) return { error: "target is not in the document" };
      if (remote === undefined) return { error: "electron.remote is unavailable" };
      // Rounded, not floored and ceiled, to frame a fractional box as chromedriver did, so a
      // retake of an unchanged block reproduces the committed image byte for byte.
      const left = Math.max(0, Math.round(box.left - padding));
      const top = Math.max(0, Math.round(box.top - padding));
      const width = Math.min(window.innerWidth - left, Math.round(box.width + 2 * padding));
      const height = Math.min(window.innerHeight - top, Math.round(box.height + 2 * padding));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stalled = new Promise<CaptureReply>((resolve) => {
        timer = setTimeout(() => resolve({ error: `no image after ${timeoutMs} ms` }), timeoutMs);
      });
      const captured = remote
        .getCurrentWebContents()
        .capturePage({ x: left, y: top, width, height })
        .then(
          (image): CaptureReply => ({ data: image.toPNG().toString("base64") }),
          (error: unknown): CaptureReply => ({ error: String(error) }),
        );
      try {
        return await Promise.race([captured, stalled]);
      } finally {
        clearTimeout(timer);
      }
    },
    selector,
    options.padding ?? 0,
    CAPTURE_TIMEOUT_MS,
  );
  if (reply.data === undefined) throw new CaptureFailedError(selector, reply.error ?? "no image");
  await writeFile(file, reply.data, "base64");
}

/** Save an element screenshot of `selector` in each Obsidian theme. */
export async function captureThemed(selector: string, name: string, options: CaptureOptions = {}): Promise<void> {
  await waitForStableLayout(selector);
  for (const theme of THEMES) {
    await browser.executeObsidian(({ app }, id) => {
      // Undocumented: sets the vault's `theme` config and restyles live, as the appearance tab does.
      (app as unknown as { changeTheme(themeId: string): void }).changeTheme(id);
    }, theme.id);
    await browser.waitUntil(
      async () => browser.execute((cls: string) => document.body.classList.contains(cls), theme.bodyClass),
      { timeoutMsg: `Obsidian theme ${theme.id} was never applied` },
    );
    // changeTheme suspends CSS transitions for 200 ms, and collapses the block's width for a
    // moment while it re-lays-out, which the layout wait in saveElementScreenshot rides out.
    await browser.pause(250);
    await saveElementScreenshot(selector, path.join(ASSETS, `${name}-${theme.suffix}.png`), options);
  }
}

/** Read every matching element's trimmed text content. */
export function textsOf(selector: string): Promise<string[]> {
  return browser.execute(
    (sel) => [...document.querySelectorAll<HTMLElement>(sel)].map((el) => el.textContent?.trim() ?? ""),
    selector,
  );
}

// The default right sidebar is narrower than some views need at a readable size — content
// overflows and clips rather than shrinking below its minimums. Force a width the way CLAUDE.md
// documents for narrow-pane responsive testing, used here in the opposite direction, and wait
// for `settleSelector`'s box to actually reach it before anything reads marks or captures against
// it (a flex/grid layout can report a non-zero clientWidth mid-reflow).
export async function widenRightSidebar(px: number, settleSelector: string): Promise<void> {
  await browser.execute((width: number) => {
    const split = document.querySelector<HTMLElement>(".mod-right-split");
    if (split) split.style.width = `${width}px`;
  }, px);
  await waitForState(
    () => browser.execute((sel: string) => document.querySelector<HTMLElement>(sel)?.clientWidth ?? 0, settleSelector),
    (width) => width >= px - 40,
    "waited for the sidebar's content to settle at the widened width",
  );
}

/** Write what an example actually did, for comparison with what its page claims. */
export async function recordOutcome(name: string, outcome: unknown): Promise<void> {
  await mkdir(OUTCOMES, { recursive: true });
  await writeFile(path.join(OUTCOMES, `${name}.json`), `${JSON.stringify(outcome, null, 2)}\n`);
}
