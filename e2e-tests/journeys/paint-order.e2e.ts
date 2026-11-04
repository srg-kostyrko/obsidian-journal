import { browser, expect } from "@wdio/globals";

import { closePopoutWindows, seedNote, waitForActiveNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { dayAnchor, decorationBackgroundHex, note } from "./decorations.js";
import { calendar, openCalendarView } from "./view.js";

import type { CellLocator } from "./calendar.js";

// The highlight layers (today / selected / active) stack around a decoration inside one isolated
// cell. These read the compiled scoped CSS from real Chromium, which no unit test can: jsdom
// resolves neither the cascade nor the stacking-relevant computed values.

const DECORATED_BG = "#123456";
const RING_HEX = "#fedcba";
const ACTIVE_BG_HEX = "#00aa55";
const DAY = 15;
const PLAIN_DAY = 16;

interface CapturedBitmap {
  toBitmap(): { length: number; readUInt8(offset: number): number };
}
interface ElectronHost {
  electron?: { remote?: { getCurrentWebContents(): { capturePage(rect: object): Promise<CapturedBitmap> } } };
}

// Reads the pixel the compositor painted at a point inside a cell, off its label. Electron's
// capturePage, not chromedriver's screenshot, which hangs against Obsidian. The capture is a small
// square around the point, so the center pixel is found from the bitmap's own size whatever the
// device pixel ratio is; toBitmap() is blue-green-red-alpha.
async function paintedHex(anchor: string): Promise<string | undefined> {
  const reply = await browser.execute(async (cellAnchor: string) => {
    const box = document
      .querySelector(`.notes-month-view__day[data-anchor="${CSS.escape(cellAnchor)}"]`)
      ?.getBoundingClientRect();
    const remote = (window as unknown as ElectronHost).electron?.remote;
    if (box === undefined || remote === undefined) return null;
    const x = Math.round(box.left + 6);
    const y = Math.round(box.top + box.height / 2);
    const image = await remote.getCurrentWebContents().capturePage({ x: x - 1, y: y - 1, width: 3, height: 3 });
    const bytes = image.toBitmap();
    const side = Math.round(Math.sqrt(bytes.length / 4));
    const offset = (Math.floor(side / 2) * side + Math.floor(side / 2)) * 4;
    return [bytes.readUInt8(offset + 2), bytes.readUInt8(offset + 1), bytes.readUInt8(offset)];
  }, anchor);
  if (reply === null) return undefined;
  return `#${reply.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

async function px(cell: CellLocator, selector: string, property: string): Promise<string | undefined> {
  const prop = await cell.$(selector).getCSSProperty(property);
  // WebDriver parses a bare number (z-index "1") to a number despite the declared string.
  const value: unknown = prop.value;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

const layerZ = (cell: CellLocator, layer: "today" | "selected" | "active"): Promise<string | undefined> =>
  px(cell, `[data-layer="${layer}"]`, "z-index");

// A dispatched click, not a pointer click: the right sidebar is still settling when the view
// opens, and a pointer click aimed at the cell's old center landed on its neighbor.
function clickCell(anchor: string, shiftKey: boolean): Promise<void> {
  return browser.execute(
    (selectedAnchor, shift) => {
      document
        .querySelector<HTMLElement>(`.notes-month-view__day[data-anchor="${CSS.escape(selectedAnchor)}"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, shiftKey: shift }));
    },
    anchor,
    shiftKey,
  );
}

// Opens the decorated day's note (the active state) and then selects it on Shift+click, so one
// cell carries the selected, active and decoration layers together.
async function selectDecoratedOpenDay(): Promise<CellLocator> {
  const anchor = dayAnchor(DAY);
  await seedNote(`day/${anchor}.md`, note("daily", anchor, "marker #layered"));
  await openCalendarView();
  const cell = calendar.cell(anchor);
  // A click before the seeded note is indexed would race note creation.
  await waitForState(
    () => decorationBackgroundHex(cell),
    (hex) => hex === DECORATED_BG,
    `the decorated day did not take the ${DECORATED_BG} background`,
  );
  await clickCell(anchor, false);
  await waitForActiveNote(`day/${anchor}.md`);
  await calendar.waitForActive(anchor);
  await clickCell(anchor, true);
  await waitForState(
    async () => (await cell.getAttribute("aria-selected")) ?? undefined,
    (selected) => selected === "true",
    "the decorated day did not become selected",
  );
  return cell;
}

describe("paint order of highlight states around a decoration", () => {
  let cell: CellLocator;

  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-paint-order", plugins: ["journals"] });
    cell = await selectDecoratedOpenDay();
  });

  after(closePopoutWindows);

  it("the selected ring sits above a decoration background", async () => {
    expect(await layerZ(cell, "selected")).toBe("1");
    // WebDriver strips the spaces from a shorthand, so the ring color is read from its parse.
    const ring = await cell.$('[data-layer="selected"]').getCSSProperty("box-shadow");
    expect((ring.parsed as { hex?: string }).hex?.toLowerCase()).toBe(RING_HEX);
    expect(await px(cell, '[data-testid="cell-decoration"]', "z-index")).toBe("auto");
    expect(await decorationBackgroundHex(cell)).toBe(DECORATED_BG);
  });

  it("the selected ring sits above a decoration border", async () => {
    await cell.$(".cell-decoration__border").waitForExist({ timeoutMsg: "the decorated cell rendered no border" });
    expect(await px(cell, ".cell-decoration__border", "border-top-width")).toBe("3px");
    expect(await px(cell, ".cell-decoration__border", "z-index")).toBe("auto");
    expect(await layerZ(cell, "selected")).toBe("1");
  });

  it("the open-note fill stays under the decoration", async () => {
    expect(await layerZ(cell, "active")).toBe("-1");
  });

  it("decoration marks stay above every state layer", async () => {
    await cell.$(".cell-marks").waitForExist({ timeoutMsg: "the decorated cell rendered no marks" });
    expect(await px(cell, ".cell-marks", "z-index")).toBe("2");
  });

  it("keeps the 2px focus-visible outline on a selected cell", async () => {
    // Tab out of the grid and back, so the cell takes focus by keyboard and :focus-visible matches.
    await browser.execute((anchor) => {
      document.querySelector<HTMLElement>(`.notes-month-view__day[data-anchor="${CSS.escape(anchor)}"]`)?.focus();
    }, dayAnchor(DAY));
    await browser.keys(["Tab"]);
    await browser.keys(["Shift", "Tab"]);
    await waitForState(
      () =>
        browser.execute((anchor) => {
          const focused = document.activeElement;
          return (
            focused instanceof HTMLElement && focused.dataset.anchor === anchor && focused.matches(":focus-visible")
          );
        }, dayAnchor(DAY)),
      (focused) => focused,
      "keyboard focus did not return to the selected cell with :focus-visible",
    );
    const width = await cell.getCSSProperty("outline-width");
    expect(typeof width.parsed.value === "number" ? Math.round(width.parsed.value) : width.value).toBe(2);
  });
});

describe("the open-note fill on a cell with no decoration", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-paint-order", plugins: ["journals"] });
  });

  after(closePopoutWindows);

  it("paints the saved active background", async () => {
    const anchor = dayAnchor(PLAIN_DAY);
    await seedNote(`day/${anchor}.md`, note("daily", anchor, "plain"));
    await openCalendarView();
    await clickCell(anchor, false);
    await waitForActiveNote(`day/${anchor}.md`);
    await calendar.waitForActive(anchor);
    await waitForState(
      () => paintedHex(anchor),
      (hex) => hex === ACTIVE_BG_HEX,
      `the open note's cell did not paint ${ACTIVE_BG_HEX}`,
    );
  });

  // The -1 fill layers only stay above a host's backgrounds because the cell isolates its own
  // stacking context. In the sidebar Obsidian's `.workspace-leaf` isolates already, so no pixel
  // differs when the cell's own isolation is dropped (measured), and the computed value is the
  // only thing that can guard it for hosts that do not.
  it("isolates its stacking context so the fill layers stay visible", async () => {
    const cell = calendar.cell(dayAnchor(PLAIN_DAY));
    expect(await cell.getCSSProperty("isolation")).toHaveProperty("value", "isolate");
  });
});

describe("paint order with a snippet", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-paint-order-snippet", plugins: ["journals"] });
  });

  after(closePopoutWindows);

  it("a snippet can put the selected ring back under", async () => {
    const cell = await selectDecoratedOpenDay();
    await waitForState(
      () => layerZ(cell, "selected"),
      (z) => z === "-1",
      "the snippet's --journal-cell-selected-layer: -1 did not reach the selected layer",
    );
  });
});
