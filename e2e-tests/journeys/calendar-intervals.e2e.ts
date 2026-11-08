import { $, browser, expect } from "@wdio/globals";

import { reloadObsidianOn } from "../support/clock.js";
import { openNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { readColors } from "./calendar.js";

// The sprint journal runs two-week intervals from Monday 5 January 2026, and the view stacks a month block over
// its Custom intervals block. Today is pinned inside the first interval (5–18 January); the second runs
// 19 January to 1 February. Each interval row has a name segment on the default color and a date segment with
// a color of its own (#57ab5a). The fixture ships the first interval's note and a snippet that sets today's
// text color while `body[data-e2e-today-red]` is present.
const PINNED_TODAY = "2026-01-08";
const TODAY_ROW = "2026-01-05";
const OTHER_DAY = "2026-01-21";
const OTHER_ROW = "2026-01-19";
const TODAY_NOTE = "sprint/2026-01-05.md";
const CHOSEN_COLOR = "#57ab5a";

const VIEW_ID = "7e2b9c41-5d3a-4f8e-a1c6-3b9d0e4f7a25";
const ROOT = `[data-journal-view="${VIEW_ID}"]`;
const MONTH = `${ROOT} .journal-view-month-calendar`;
const BLOCK = `${ROOT} .journal-view-custom-intervals`;

// Every case forces the block's width, so wide and narrow do not depend on the sidebar's.
const WIDE = "40em";
const NARROW = "300px";

const row = (anchor: string): string => `${BLOCK} .journal-view-custom-intervals__entry[data-anchor="${anchor}"]`;
const defaultSegment = (anchor: string): string => `${row(anchor)} .nav-row[data-default-color]`;
const chosenSegment = (anchor: string): string => `${row(anchor)} .nav-row:not([data-default-color])`;

class IntervalRowError extends Error {
  override name = "IntervalRowError";
}

async function openView(): Promise<void> {
  // Revealed, not only placed: the right sidebar boots collapsed, and a collapsed split lays nothing out.
  await browser.executeObsidian(async ({ app }, id) => {
    const leaf = app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: `journal-view:${id}`, active: true });
    await app.workspace.revealLeaf(leaf);
  }, VIEW_ID);
  await $(row(TODAY_ROW)).waitForDisplayed({ timeoutMsg: "the Custom intervals block showed no row for today" });
}

async function detachView(): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    for (const leaf of app.workspace.getLeavesOfType(`journal-view:${id}`)) leaf.detach();
  }, VIEW_ID);
}

async function forceWidth(width: string): Promise<void> {
  await browser.execute(
    (selector: string, forced: string) => {
      for (const candidate of document.querySelectorAll<HTMLElement>(selector)) {
        if (candidate.clientWidth === 0) continue;
        candidate.style.width = forced;
        candidate.style.maxWidth = "none";
      }
    },
    BLOCK,
    width,
  );
}

async function setTodayRedSnippet(on: boolean): Promise<void> {
  await browser.execute((enabled: boolean) => {
    if (enabled) document.body.dataset.e2eTodayRed = "";
    else delete document.body.dataset.e2eTodayRed;
  }, on);
}

async function segmentHex(selector: string): Promise<string | undefined> {
  const read = await $(selector).getCSSProperty("color");
  return (read.parsed as { hex?: string }).hex;
}

// The theme value as the segment would resolve it, so the comparison holds under whatever theme runs.
async function themeHex(variable: string, near: string): Promise<string | undefined> {
  const { theme } = await readColors({ theme: { variable, near } });
  return theme;
}

async function expectSegmentHex(selector: string, expected: () => Promise<string | undefined>, message: string) {
  let last: { segment?: string; expected?: string } = {};
  await waitForState(
    async () => {
      last = { segment: await segmentHex(selector), expected: await expected() };
      return last;
    },
    (read) => read.expected !== undefined && read.segment === read.expected,
    message,
  ).catch((error: unknown) => {
    throw new IntervalRowError(`${message}: read ${JSON.stringify(last)}`, { cause: error });
  });
}

interface RowRead {
  readonly today: boolean;
  readonly selected: boolean;
  readonly active: boolean;
  readonly layers: readonly string[];
  // The widest length in the selected ring's box-shadow (its spread), rounded: Obsidian's zoom scales pixels.
  readonly selectedRing: number | null;
  readonly selectedFill: number | null;
  readonly activeFill: number | null;
}

function readRow(anchor: string): Promise<RowRead | null> {
  return browser.execute((selector: string) => {
    const entry = document.querySelector<HTMLElement>(selector);
    if (!entry) return null;
    const layer = (name: string): Element | null => entry.querySelector(`[data-layer="${CSS.escape(name)}"]`);
    const opacity = (name: string): number | null => {
      const found = layer(name);
      return found ? Number(getComputedStyle(found).opacity) : null;
    };
    const ring = layer("selected-ring");
    const lengths = ring ? (getComputedStyle(ring).boxShadow.match(/-?[\d.]+px/g) ?? []).map(Number.parseFloat) : [];
    return {
      today: entry.dataset.today !== undefined,
      selected: entry.dataset.selected !== undefined,
      active: entry.dataset.active !== undefined,
      layers: [...entry.querySelectorAll<HTMLElement>("[data-layer]")].map((found) => found.dataset.layer ?? ""),
      selectedRing: ring ? Math.round(Math.max(0, ...lengths)) : null,
      selectedFill: opacity("selected-fill"),
      activeFill: opacity("active-fill"),
    };
  }, row(anchor));
}

async function settleRow(anchor: string, accept: (read: RowRead) => boolean, message: string): Promise<RowRead> {
  let last: RowRead | null = null;
  await waitForState(
    async () => {
      last = await readRow(anchor);
      return last;
    },
    accept,
    message,
  ).catch((error: unknown) => {
    throw new IntervalRowError(`${message}: read ${JSON.stringify(last)}`, { cause: error });
  });
  return last as unknown as RowRead;
}

interface CapturedBitmap {
  toBitmap(): { length: number; readUInt8(offset: number): number };
}
interface ElectronHost {
  electron?: { remote?: { getCurrentWebContents(): { capturePage(rect: object): Promise<CapturedBitmap> } } };
}

// The painted pixel across a segment's text box that comes closest to `target`, and how far off it is on its
// worst channel. A glyph's stems are fully covered, so text painted on top shows its exact color there; a
// layer painted over the text shifts every pixel. Electron's capturePage, not chromedriver's screenshot,
// which hangs against Obsidian; toBitmap() is blue-green-red-alpha.
async function closestTextPixel(selector: string, target: string): Promise<{ hex: string; off: number } | null> {
  return browser.execute(
    async (textSelector: string, targetHex: string) => {
      const box = document.querySelector(textSelector)?.getBoundingClientRect();
      const remote = (window as unknown as ElectronHost).electron?.remote;
      if (box === undefined || box.width === 0 || remote === undefined) return null;
      const image = await remote.getCurrentWebContents().capturePage({
        x: Math.floor(box.left),
        y: Math.floor(box.top),
        width: Math.ceil(box.width),
        height: Math.ceil(box.height),
      });
      const bytes = image.toBitmap();
      const wanted = [1, 3, 5].map((at) => Number.parseInt(targetHex.slice(at, at + 2), 16));
      let best: { hex: string; off: number } | null = null;
      for (let offset = 0; offset + 3 < bytes.length; offset += 4) {
        const pixel = [bytes.readUInt8(offset + 2), bytes.readUInt8(offset + 1), bytes.readUInt8(offset)];
        const off = Math.max(...pixel.map((channel, at) => Math.abs(channel - (wanted[at] ?? 0))));
        if (best === null || off < best.off) {
          best = { hex: `#${pixel.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`, off };
        }
      }
      return best;
    },
    selector,
    target,
  );
}

async function selectDay(anchor: string): Promise<void> {
  // A shift-click selects the date without opening it.
  await browser.execute(
    (month: string, target: string) => {
      document
        .querySelector<HTMLElement>(`${month} .notes-month-view__day[data-anchor="${CSS.escape(target)}"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, shiftKey: true }));
    },
    MONTH,
    anchor,
  );
}

describe("custom interval rows in the calendar appearance", () => {
  before(async () => {
    await reloadObsidianOn(PINNED_TODAY, {
      vault: "./e2e-tests/fixtures/e2e-calendar-intervals",
      plugins: ["journals"],
    });
    await openView();
    await forceWidth(WIDE);
  });

  after(async () => {
    await setTodayRedSnippet(false);
    await detachView();
  });

  it("the row containing today shows its default-color segment in the theme accent", async () => {
    await settleRow(TODAY_ROW, (read) => read.today, "the row containing today was not marked today");
    await expectSegmentHex(
      defaultSegment(TODAY_ROW),
      () => themeHex("--text-accent", defaultSegment(TODAY_ROW)),
      "the today row's default-color segment did not read the theme's --text-accent",
    );
  });

  it("a snippet's today text color reaches the default-color segment and leaves a chosen color alone", async () => {
    await setTodayRedSnippet(true);
    try {
      await expectSegmentHex(
        defaultSegment(TODAY_ROW),
        () => Promise.resolve("#ff0000"),
        "the snippet's today text color did not reach the today row's default-color segment",
      );
      expect(await segmentHex(chosenSegment(TODAY_ROW))).toBe(CHOSEN_COLOR);
    } finally {
      await setTodayRedSnippet(false);
    }
  });

  describe("after selecting a date in another interval", () => {
    before(async () => {
      // Without a ring to start from, the today row "losing" it below would prove nothing.
      await settleRow(
        TODAY_ROW,
        (read) => read.selected && read.layers.includes("selected-ring"),
        "the today row was not selected before the move",
      );
      await selectDay(OTHER_DAY);
      await settleRow(OTHER_ROW, (read) => read.selected, `selecting ${OTHER_DAY} did not mark its interval row`);
    });

    it("rings the selected row 2px wide and takes the ring off today's row", async () => {
      const selected = await settleRow(
        OTHER_ROW,
        (read) => read.selectedRing !== null,
        "the selected row has no selected ring",
      );
      expect(selected.selectedRing).toBe(2);
      // The tint is the narrow block's alone; a wide one's selected fill stays clear.
      expect(selected.selectedFill).toBe(0);
      const today = await settleRow(TODAY_ROW, (read) => read.today, "the today row lost its today mark");
      expect({ selected: today.selected, layers: today.layers }).toEqual({
        selected: false,
        layers: ["today-fill", "today-ring"],
      });
    });

    it("tints the selected row instead of ringing it on a narrow block", async () => {
      await forceWidth(NARROW);
      try {
        const narrow = await settleRow(
          OTHER_ROW,
          (read) => read.selectedRing === 0,
          `the selected row kept a ring at ${NARROW}`,
        );
        expect(narrow.selectedFill).toBe(0.2);
      } finally {
        await forceWidth(WIDE);
      }
    });

    it("fills the open note's row and turns both its segments on-accent, over today's text", async () => {
      await setTodayRedSnippet(true);
      try {
        await openNote(TODAY_NOTE);
        const active = await settleRow(
          TODAY_ROW,
          (read) => read.active,
          "opening the today interval's note did not mark its row",
        );
        expect(active.activeFill).toBe(1);
        for (const segment of [defaultSegment(TODAY_ROW), chosenSegment(TODAY_ROW)]) {
          await expectSegmentHex(
            segment,
            () => themeHex("--text-on-accent", segment),
            `${segment} did not read the theme's --text-on-accent on the open note's row`,
          );
        }
      } finally {
        await setTodayRedSnippet(false);
      }
    });

    // Text paints above every highlight layer, as a calendar cell's label does: the narrow block's tint over the
    // open note's fill must leave the segment text its own color, not a tinted one.
    it("keeps the open note's text clear of the selected tint on a narrow block", async () => {
      await openNote(TODAY_NOTE);
      await selectDay(PINNED_TODAY);
      await forceWidth(NARROW);
      try {
        const narrow = await settleRow(
          TODAY_ROW,
          (read) => read.active && read.selected && read.selectedFill === 0.2,
          "the open note's row was not tinted as selected on a narrow block",
        );
        expect(narrow.layers).toEqual(["selected-fill", "active-fill", "today-ring", "selected-ring", "active-ring"]);
        const text = `${defaultSegment(TODAY_ROW)} .nav-row__text`;
        const message = "the open note's segment text did not paint in the theme's --text-on-accent under the tint";
        let last: { onAccent?: string; pixel?: { hex: string; off: number } | null } = {};
        await waitForState(
          async () => {
            const onAccent = await themeHex("--text-on-accent", defaultSegment(TODAY_ROW));
            last = { onAccent, pixel: onAccent === undefined ? null : await closestTextPixel(text, onAccent) };
            return last;
          },
          (read) => read.pixel != null && read.pixel.off <= 2,
          message,
        ).catch((error: unknown) => {
          throw new IntervalRowError(`${message}: read ${JSON.stringify(last)}`, { cause: error });
        });
      } finally {
        await forceWidth(WIDE);
      }
    });
  });
});
