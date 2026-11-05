import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { closePopoutWindows, seedNote, waitForActiveNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { borderTop, dayAnchor, decorationBackgroundHex, decorationTextHex, note } from "./decorations.js";
import { calendar, openCalendarView } from "./view.js";

import type { CellLocator } from "./calendar.js";

// The highlight layers (today / selected / active) stack around a decoration inside one isolated
// cell. These read the compiled scoped CSS from real Chromium, which no unit test can: jsdom
// resolves neither the cascade nor the stacking-relevant computed values.

const DECORATED_BG = "#123456";
const DECORATED_TEXT = "#cc3300";
const RING_HEX = "#fedcba";
const ACTIVE_BG_HEX = "#00aa55";
// Set by each fixture's snippet; the selected state has no stock text color.
const SELECTED_TEXT = "#00aa00";
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

// The label's color goes through color-mix, which Chromium serializes as color(srgb …) and
// WebDriver cannot parse to hex, so the page paints it on a canvas and reads the pixel back.
async function labelHex(anchor: string): Promise<string | undefined> {
  const hex = await browser.execute((cellAnchor: string) => {
    const label = document.querySelector(
      `.notes-month-view__day[data-anchor="${CSS.escape(cellAnchor)}"] .cell-decoration__content`,
    );
    const context = document.createElement("canvas").getContext("2d");
    if (label === null || context === null) return null;
    const color = getComputedStyle(label).color;
    // A color the canvas rejects leaves fillStyle on its preset; two presets both surviving means
    // the read failed, and the raw value goes back so it can never equal a hex.
    const rejected = ["#010203", "#040506"].every((preset) => {
      context.fillStyle = preset;
      context.fillStyle = color;
      return context.fillStyle === preset;
    });
    if (rejected) return color;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }, anchor);
  return hex ?? undefined;
}

// A theme variable's color as the cell would resolve it: a probe inside the cell's parent, so the
// same body and view scoping apply, normalized the same way as labelHex.
async function themeHex(anchor: string, variable: string): Promise<string | undefined> {
  const hex = await browser.execute(
    (cellAnchor: string, name: string) => {
      const host = document.querySelector(
        `.notes-month-view__day[data-anchor="${CSS.escape(cellAnchor)}"]`,
      )?.parentElement;
      const context = document.createElement("canvas").getContext("2d");
      if (host == null || context === null) return null;
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      host.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      const rejected = ["#010203", "#040506"].every((preset) => {
        context.fillStyle = preset;
        context.fillStyle = color;
        return context.fillStyle === preset;
      });
      if (rejected) return `unparsed theme color ${color}`;
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
      return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    },
    anchor,
    variable,
  );
  return hex ?? undefined;
}

// The pixels of a 3px strip across the cell's left edge. The 2px ring renders narrower under
// Obsidian's zoom and straddles pixel boundaries, so one sample can be part pane background;
// across the strip at least one pixel is almost all ring.
async function edgeHexes(anchor: string): Promise<string[]> {
  const reply = await browser.execute(async (cellAnchor: string) => {
    const box = document
      .querySelector(`.notes-month-view__day[data-anchor="${CSS.escape(cellAnchor)}"]`)
      ?.getBoundingClientRect();
    const remote = (window as unknown as ElectronHost).electron?.remote;
    if (box === undefined || remote === undefined) return null;
    const image = await remote
      .getCurrentWebContents()
      .capturePage({ x: Math.floor(box.left), y: Math.round(box.top + box.height / 2), width: 3, height: 1 });
    const bytes = image.toBitmap();
    const pixels: number[][] = [];
    for (let offset = 0; offset + 3 < bytes.length; offset += 4) {
      pixels.push([bytes.readUInt8(offset + 2), bytes.readUInt8(offset + 1), bytes.readUInt8(offset)]);
    }
    return pixels;
  }, anchor);
  return (reply ?? []).map((pixel) => `#${pixel.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`);
}

// Near-magenta: the ring's #ff00ff over at most a sliver of anything else. Neither the open-note
// fill (#00aa55) nor a light or dark pane background comes close on all three channels.
function isRingPixel(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return (r ?? 0) > 192 && (g ?? 255) < 64 && (b ?? 0) > 192;
}

async function px(cell: CellLocator, selector: string, property: string): Promise<string | undefined> {
  const prop = await cell.$(selector).getCSSProperty(property);
  // WebDriver parses a bare number (z-index "1") to a number despite the declared string.
  const value: unknown = prop.value;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

type Layer = `${"today" | "selected" | "active"}-${"fill" | "ring"}`;

const layerZ = (cell: CellLocator, layer: Layer): Promise<string | undefined> =>
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
    expect(await layerZ(cell, "selected-ring")).toBe("1");
    // WebDriver strips the spaces from a shorthand, so the ring color is read from its parse.
    const ring = await cell.$('[data-layer="selected-ring"]').getCSSProperty("box-shadow");
    expect((ring.parsed as { hex?: string }).hex?.toLowerCase()).toBe(RING_HEX);
    expect(await px(cell, '[data-testid="cell-decoration"]', "z-index")).toBe("auto");
    expect(await decorationBackgroundHex(cell)).toBe(DECORATED_BG);
  });

  it("the selected ring sits above a decoration border", async () => {
    await cell.$(".cell-decoration__border").waitForExist({ timeoutMsg: "the decorated cell rendered no border" });
    const { width } = await borderTop(cell);
    expect(width).toBe("3px");
    expect(await px(cell, ".cell-decoration__border", "z-index")).toBe("auto");
    expect(await layerZ(cell, "selected-ring")).toBe("1");
  });

  it("the open-note fill stays under the decoration", async () => {
    expect(await layerZ(cell, "active-fill")).toBe("-1");
  });

  it("decoration marks stay above every state layer", async () => {
    await cell.$(".cell-marks").waitForExist({ timeoutMsg: "the decorated cell rendered no marks" });
    expect(await px(cell, ".cell-marks", "z-index")).toBe("3");
    expect(await px(cell, ".cell-decoration__content", "z-index")).toBe("2");
  });

  // The cell is also the open note, whose stock text sits under the decoration. Precedence picks the
  // open note, and only the winner's layer counts, so the selected over-text does not show.
  it("a selected over-text loses to the open note's under-text on a decorated day", async () => {
    expect(await decorationTextHex(cell)).toBe(DECORATED_TEXT);
    await waitForState(
      () => labelHex(dayAnchor(DAY)),
      (hex) => hex === DECORATED_TEXT,
      `the label did not keep the decoration's ${DECORATED_TEXT} under the open note (not the selected ${SELECTED_TEXT})`,
    );
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
  let cell: CellLocator;

  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-paint-order-snippet", plugins: ["journals"] });
    cell = await selectDecoratedOpenDay();
  });

  after(closePopoutWindows);

  it("a snippet can put the selected ring back under", async () => {
    await waitForState(
      () => layerZ(cell, "selected-ring"),
      (z) => z === "-1",
      "the snippet's --journal-cell-selected-layer: -1 did not reach the selected layer",
    );
  });

  it("selected text under a decoration keeps the decoration's color", async () => {
    await waitForState(
      () => labelHex(dayAnchor(DAY)),
      (hex) => hex === DECORATED_TEXT,
      `the selected label under the decoration did not keep ${DECORATED_TEXT}`,
    );
  });
});

describe("today's ring on the open note's day", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-paint-order-snippet", plugins: ["journals"] });
  });

  after(closePopoutWindows);

  // The snippet gives today a #ff00ff 2px ring and the fixture an #00aa55 open-note fill. Both
  // layers sit at -1, so only the fills-then-rings DOM order keeps the ring above the fill.
  it("a today ring stays visible on the open note's day", async () => {
    const day = new Date().getDate();
    const anchor = dayAnchor(day);
    await seedNote(`day/${anchor}.md`, note("daily", anchor, "plain"));
    await openCalendarView();
    await clickCell(anchor, false);
    await waitForActiveNote(`day/${anchor}.md`);
    await calendar.waitForActive(anchor);
    const cell = calendar.cell(anchor);
    // The view selects today, and the selected ring paints after today's at the same width. Move the
    // selection to a neighbor so only today's ring is left at the edge.
    await clickCell(dayAnchor(day === 1 ? 2 : day - 1), true);
    await waitForState(
      async () => (await cell.getAttribute("aria-selected")) ?? "false",
      (selected) => selected === "false",
      "today's cell stayed selected after the selection moved to its neighbor",
    );
    expect(await cell.$('[data-layer="today-fill"]').isExisting()).toBe(false);
    await waitForState(
      () => paintedHex(anchor),
      (hex) => hex === ACTIVE_BG_HEX,
      `the open note's cell did not paint ${ACTIVE_BG_HEX} inside the ring`,
    );
    await waitForState(
      () => edgeHexes(anchor),
      (hexes) => hexes.some(isRingPixel),
      "today's #ff00ff ring did not show at the open note's edge over the #00aa55 fill",
    );
  });
});

// A second view in the base fixture: it does not follow the active date, so opening an outside
// day's note leaves that day outside instead of paging to the note's month, and it carries a
// next-month button. Kept apart from the base view, which every other case here uses as stock.
const OUTSIDE_VIEW = "6d1c0e5a-3f2b-4c8d-9a7e-5b4c3d2e1f0a";
const OUTSIDE_VIEW_ROOT = `[data-journal-view="${OUTSIDE_VIEW}"]`;
const MAX_MONTH_STEPS = 3;

async function openOutsideView(): Promise<void> {
  // Revealed, not only placed: the right sidebar boots collapsed, and the next-month button has to
  // be clickable.
  await browser.executeObsidian(async ({ app }, id) => {
    const leaf = app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: `journal-view:${id}`, active: true });
    await app.workspace.revealLeaf(leaf);
  }, OUTSIDE_VIEW);
  await $(`${OUTSIDE_VIEW_ROOT} .notes-month-view__day`).waitForDisplayed({
    timeoutMsg: "the outside-days view did not show a day cell",
  });
}

const firstDayAnchor = (): Promise<string | null> =>
  $(`${OUTSIDE_VIEW_ROOT} .notes-month-view__day`).getAttribute("data-anchor");

// A month that starts on the week's first day and ends on its last (February 2027 under a Monday
// start) shows no outside day, so this pages forward with the view's own control until one does.
// Answers "" when none of the next MAX_MONTH_STEPS months has one either.
async function pageToMonthWithOutsideDay(): Promise<string> {
  for (let step = 0; step <= MAX_MONTH_STEPS; step++) {
    const outside = await $$(`${OUTSIDE_VIEW_ROOT} .notes-month-view__day[data-outside]`).getElements();
    const first = outside.at(0);
    if (first !== undefined) return (await first.getAttribute("data-anchor")) ?? "";
    if (step === MAX_MONTH_STEPS) break;
    const before = await firstDayAnchor();
    await $(
      `${OUTSIDE_VIEW_ROOT} [aria-label="${m.view_toolbar_button_default_tooltip_next_unit({ unit: "month" })}"]`,
    ).click();
    await waitForState(
      firstDayAnchor,
      (anchor) => anchor !== before,
      "the outside-days view did not page to the next month",
    );
  }
  return "";
}

describe("text on a day outside the month", () => {
  let anchor: string;

  // An undecorated note on a leading or trailing day: a one-month block shows outside days as
  // interactive, so the note opens from its cell and the cell is both outside and the open note.
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-paint-order", plugins: ["journals"] });
    await openOutsideView();
    // clickCell, labelHex and themeHex query the document, so this view must be the only calendar.
    expect(await $$(".notes-month-view").length).toBe(1);
    anchor = await pageToMonthWithOutsideDay();
    expect(anchor).not.toBe("");
    await seedNote(`day/${anchor}.md`, note("daily", anchor, "plain"));
    await clickCell(anchor, false);
    await waitForActiveNote(`day/${anchor}.md`);
    await calendar.waitForActive(anchor);
    // The fixture snippet gives the selected state its own text color, over decorations, so the
    // selection moves to an in-month day to leave the open note's text alone on the cell.
    const cell = calendar.cell(anchor);
    const inside = await $(`${OUTSIDE_VIEW_ROOT} .notes-month-view__day:not([data-outside])`).getAttribute(
      "data-anchor",
    );
    await clickCell(inside ?? "", true);
    await waitForState(
      async () => (await cell.getAttribute("aria-selected")) ?? "false",
      (selected) => selected === "false",
      "the outside day stayed selected after the selection moved into the month",
    );
    expect(await cell.getAttribute("data-outside")).toBe("true");
  });

  after(closePopoutWindows);

  it("an open note on a day outside the month shows the open-note text, not the muted outside color", async () => {
    const onAccent = await themeHex(anchor, "--text-on-accent");
    const muted = await themeHex(anchor, "--text-muted");
    expect(onAccent).not.toBe(muted);
    await waitForState(
      () => labelHex(anchor),
      (hex) => hex === onAccent,
      `the open outside day's label did not take --text-on-accent (${String(onAccent)})`,
    );
    expect(await labelHex(anchor)).not.toBe(muted);
  });
});

// Rounded: Obsidian's zoom scales authored pixels.
async function outsideViewLabelSize(selector: string): Promise<number | undefined> {
  const size = await $(`${OUTSIDE_VIEW_ROOT} ${selector} .cell-decoration__content`).getCSSProperty("font-size");
  return typeof size.parsed.value === "number" ? Math.round(size.parsed.value) : undefined;
}

describe("date text on days outside the month", () => {
  let anchor: string;

  // The fixture snippet sets the date size and color on the outside-days view only.
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-paint-order", plugins: ["journals"] });
    await openOutsideView();
    expect(await $$(".notes-month-view").length).toBe(1);
    anchor = await pageToMonthWithOutsideDay();
    expect(anchor).not.toBe("");
  });

  it("date size reaches days outside the month", async () => {
    await waitForState(
      () => outsideViewLabelSize(".notes-month-view__day:not([data-outside])"),
      (px) => px === 21,
      "an in-month date label did not take the snippet's 21px date size",
    );
    expect(await outsideViewLabelSize(`.notes-month-view__day[data-anchor="${anchor}"]`)).toBe(21);
  });

  it("an outside day keeps the muted color over the date color", async () => {
    const muted = await themeHex(anchor, "--text-muted");
    expect(muted).not.toBe("#123456");
    expect(await labelHex(anchor)).toBe(muted);
  });
});
