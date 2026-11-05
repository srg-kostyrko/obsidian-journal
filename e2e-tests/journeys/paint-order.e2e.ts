import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { CURRENT_VERSION } from "../../src/settings/version.js";
import { reloadObsidianOn } from "../support/clock.js";
import { readRawSettings, writeRawSettings } from "../support/plugin-data.js";
import { triggerExternalSettingsChange } from "../support/plugin.js";
import { closePopoutWindows, seedNote, waitForActiveNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { labelHexOf, readColors, type CellLocator } from "./calendar.js";
import { borderTop, dayAnchor, decorationBackgroundHex, decorationTextHex, note } from "./decorations.js";
import { calendar, openCalendarView } from "./view.js";

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

const daySelector = (anchor: string): string => `.notes-month-view__day[data-anchor="${anchor}"]`;
const labelHex = (anchor: string): Promise<string | undefined> => labelHexOf(daySelector(anchor));

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

// Clicked through the DOM, not the pointer: the sidebar reveal is still animating when the first
// day cell shows, so a physical click can land mid-slide and be lost, and re-clicking until the
// month changes would page twice if the lost click arrived late. `click()` runs the handler once,
// synchronously.
async function pageToNextMonth(): Promise<void> {
  const selector = `${OUTSIDE_VIEW_ROOT} [aria-label="${m.view_toolbar_button_default_tooltip_next_unit({ unit: "month" })}"]`;
  await $(selector).waitForExist({ timeoutMsg: "the outside-days view has no next-month button" });
  await browser.execute((css: string) => {
    document.querySelector<HTMLElement>(css)?.click();
  }, selector);
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
    await pageToNextMonth();
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
    // clickCell and readColors query the document, so this view must be the only calendar.
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

  // The references are re-read with the label on every poll: one sampled before the wait and
  // wrong once stays wrong for the whole wait.
  it("an open note on a day outside the month shows the open-note text, not the muted outside color", async () => {
    const cell = daySelector(anchor);
    const message = "the open outside day's label did not take --text-on-accent, distinct from --text-muted";
    let last: Record<"label" | "onAccent" | "muted", string | undefined> | undefined;
    await waitForState(
      async () => {
        last = await readColors({
          label: { label: cell },
          onAccent: { variable: "--text-on-accent", near: cell },
          muted: { variable: "--text-muted", near: cell },
        });
        return last;
      },
      ({ label, onAccent, muted }) => label !== undefined && label === onAccent && onAccent !== muted,
      message,
    ).catch(async (error: unknown) => {
      if (!isTimeoutOf(error, message)) throw error;
      throw asLabelMismatch(error, message, `${JSON.stringify(last)}, body ${await bodyOnAccent()}`);
    });
  });
});

// Obsidian sets --text-on-accent on the body from the accent color's luminance, so a failure names
// which side moved: the label, or the reference. It only enriches a timeout's message, so a
// renderer that cannot answer must never replace the failure itself.
async function bodyOnAccent(): Promise<string> {
  return browser
    .execute(
      () =>
        `--text-on-accent inline "${document.body.style.getPropertyValue("--text-on-accent")}", computed "${getComputedStyle(document.body).getPropertyValue("--text-on-accent").trim()}"`,
    )
    .catch(() => "unreadable");
}

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
    const cell = daySelector(anchor);
    const message = "an outside day's label did not keep --text-muted over the snippet's #123456 date color";
    let last: Record<"label" | "muted", string | undefined> | undefined;
    await waitForState(
      async () => {
        last = await readColors({ label: { label: cell }, muted: { variable: "--text-muted", near: cell } });
        return last;
      },
      ({ label, muted }) => label !== undefined && label === muted && muted !== "#123456",
      message,
    ).catch((error: unknown) => {
      throw asLabelMismatch(error, message, JSON.stringify(last));
    });
  });
});

// Text precedence and Unchanged pass-through, with the clock pinned so today lands on fixed days: the
// 31st is in its own month for the base view and a leading outside day of April 2027 (which starts on
// a Thursday under either week start) for the outside-days view. Each case saves its own appearance
// alone, so no case inherits another's values.
const PINNED_TODAY = "2027-03-31";
const PINNED_DECORATED = "2027-03-15";
const PINNED_PLAIN = "2027-03-16";
const PINNED_DECORATED_UNOPENED = "2027-03-22";
// In-month days with no note, to move the selection to; never the 1st, which shares the heading's anchor.
const MARCH_SPARE = "2027-03-10";
const APRIL_SPARE = "2027-04-12";
const BASE_VIEW_ROOT = '[data-journal-view="b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c"]';
const OPEN_NOTE_TEXT = "#00aa55";
const OUTSIDE_TEXT = "#3a5f7d";
const WEEK_NUMBER_TEXT = "#357a9b";
const PUBLIC_TODAY_TEXT = "#563412";
// The fixture snippet scopes its public today text color to a view root carrying this attribute.
const PUBLIC_TODAY_ATTRIBUTE = "data-text-precedence";
// The sidebar itself is below the breakpoint, so both widths are forced.
const NARROW_WIDTH = "300px";
const WIDE_WIDTH = "40em";
// Obsidian's --font-normal, --font-semibold and --font-bold.
const NORMAL = "400";
const SEMIBOLD = "600";
const BOLD = "700";

type Json = Record<string, unknown>;

function child(parent: Json, key: string): Json {
  const existing = parent[key];
  if (typeof existing === "object" && existing !== null) return existing as Json;
  const created: Json = {};
  parent[key] = created;
  return created;
}

// Sets `value` at a dotted path under `appearance`, creating any missing level.
function setAt(appearance: Json, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop() ?? "";
  let at = appearance;
  for (const key of keys) at = child(at, key);
  at[last] = value;
}

const custom = (color: string): { type: "custom"; color: string } => ({ type: "custom", color });

class SavedVariableError extends Error {
  override name = "SavedVariableError";
}

class LabelMismatchError extends Error {
  override name = "LabelMismatchError";
}

// Only the wait's own timeout reads as a mismatch; a renderer death or any other error passes through.
function isTimeoutOf(error: unknown, message: string): boolean {
  return error instanceof Error && error.message.startsWith(message);
}

function asLabelMismatch(error: unknown, message: string, last: string | undefined): unknown {
  if (isTimeoutOf(error, message)) {
    return new LabelMismatchError(`${message}: read ${String(last)}`, { cause: error });
  }
  return error;
}

// Every save also writes a fresh cell min-height, which no case reads: the wait on it is the one sync
// point that does not depend on how the writer encodes Unchanged, which the forced-fail runs change.
let saveMarker = 26;

// Writes the fixture's settings back the way a sync does, at the current version with an appearance
// holding only `values` (the fixture is v7, and its migration persists only on a later save), then
// waits for this save's marker on the body, so no read can see the previous case's variables.
async function saveAppearance(baseline: string, values: Record<string, unknown>): Promise<void> {
  saveMarker += 1;
  const settings = JSON.parse(baseline) as Json;
  settings.version = CURRENT_VERSION;
  const appearance: Json = {};
  settings.appearance = appearance;
  const leaves = Object.entries({ ...values, "wide.cell.minHeight": saveMarker });
  for (const [path, value] of leaves) setAt(appearance, path, value);
  await writeRawSettings(JSON.stringify(settings));
  await triggerExternalSettingsChange();
  const expected = `${saveMarker}px`;
  await waitForState(
    () => browser.execute(() => document.body.style.getPropertyValue("--journal-saved-cell-cell-min-height").trim()),
    (value) => value === expected,
    `the writer did not put this save's ${expected} cell min-height on the body`,
  ).catch((error: unknown) => {
    throw new SavedVariableError(String(error));
  });
}

async function labelWeight(cellSelector: string): Promise<string | undefined> {
  const weight = await $(`${cellSelector} .cell-decoration__content`).getCSSProperty("font-weight");
  // WebDriver parses a bare number to a number despite the declared string.
  const value: unknown = weight.value;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

// The width goes on the laid-out block root; an empty width restores its own.
async function forceBlockWidth(root: string, width: string): Promise<void> {
  await browser.execute(
    (selector: string, forced: string) => {
      const block = [...document.querySelectorAll<HTMLElement>(`${selector} .journal-view-month-calendar`)].find(
        (candidate) => candidate.clientWidth > 0 || candidate.style.width !== "",
      );
      if (block !== undefined) block.style.width = forced;
    },
    root,
    width,
  );
}

const isSelected = async (anchor: string): Promise<boolean> =>
  (await calendar.cell(anchor).getAttribute("aria-selected")) === "true";

async function selectDay(anchor: string): Promise<void> {
  if (await isSelected(anchor)) return;
  await clickCell(anchor, true);
  await waitForState(
    () => isSelected(anchor),
    (selected) => selected,
    `${anchor} did not become selected`,
  );
}

async function openDay(anchor: string): Promise<void> {
  await clickCell(anchor, false);
  await waitForActiveNote(`day/${anchor}.md`);
  await calendar.waitForActive(anchor);
}

// The fixture snippet's public selected text beats every lower state, so a case about today moves the
// selection off it first.
async function moveSelectionOff(anchor: string, spare: string): Promise<void> {
  await selectDay(spare);
  await waitForState(
    () => isSelected(anchor),
    (selected) => !selected,
    `${anchor} stayed selected after the selection moved to ${spare}`,
  );
}

async function expectLabelHex(cellSelector: string, expected: string, message: string): Promise<void> {
  let last: string | undefined;
  await waitForState(
    async () => {
      last = await labelHexOf(cellSelector);
      return last;
    },
    (hex) => hex === expected,
    message,
  ).catch((error: unknown) => {
    throw asLabelMismatch(error, message, last);
  });
}

async function expectLabelWeight(cellSelector: string, expected: string, message: string): Promise<void> {
  let last: string | undefined;
  await waitForState(
    async () => {
      last = await labelWeight(cellSelector);
      return last;
    },
    (weight) => weight === expected,
    message,
  ).catch((error: unknown) => {
    throw asLabelMismatch(error, message, last);
  });
}

describe("text precedence", () => {
  let baseline: string;

  describe("in the month", () => {
    before(async () => {
      await reloadObsidianOn(PINNED_TODAY, { vault: "./e2e-tests/fixtures/e2e-paint-order", plugins: ["journals"] });
      baseline = (await readRawSettings()) ?? "{}";
      await seedNote(`day/${PINNED_DECORATED}.md`, note("daily", PINNED_DECORATED, "marker #layered"));
      await seedNote(`day/${PINNED_PLAIN}.md`, note("daily", PINNED_PLAIN, "plain"));
      await seedNote(
        `day/${PINNED_DECORATED_UNOPENED}.md`,
        note("daily", PINNED_DECORATED_UNOPENED, "marker #layered"),
      );
      await openCalendarView();
      expect(await $$(".notes-month-view").length).toBe(1);
      for (const anchor of [PINNED_DECORATED, PINNED_DECORATED_UNOPENED]) {
        await waitForState(
          () => decorationBackgroundHex(calendar.cell(anchor)),
          (hex) => hex === DECORATED_BG,
          `${anchor} did not take the ${DECORATED_BG} background`,
        );
      }
    });

    afterEach(async () => {
      await forceBlockWidth(BASE_VIEW_ROOT, "");
      await browser.execute(
        (selector: string, attribute: string) => {
          document.querySelector(selector)?.removeAttribute(attribute);
        },
        BASE_VIEW_ROOT,
        PUBLIC_TODAY_ATTRIBUTE,
      );
    });

    after(closePopoutWindows);

    it("an under open note beats an over selected on a decorated day", async () => {
      await saveAppearance(baseline, { "wide.active.text.color": custom(OPEN_NOTE_TEXT) });
      await openDay(PINNED_DECORATED);
      await selectDay(PINNED_DECORATED);
      await expectLabelHex(
        daySelector(PINNED_DECORATED),
        DECORATED_TEXT,
        `the decorated open note did not keep the decoration's ${DECORATED_TEXT} under the selected ${SELECTED_TEXT}`,
      );
      await openDay(PINNED_PLAIN);
      await selectDay(PINNED_PLAIN);
      await expectLabelHex(
        daySelector(PINNED_PLAIN),
        OPEN_NOTE_TEXT,
        `the plain open note did not show its ${OPEN_NOTE_TEXT} over the selected ${SELECTED_TEXT}`,
      );
    });

    it("a selected over-text shows on a decorated day that is not the open note", async () => {
      await saveAppearance(baseline, { "wide.active.text.color": custom(OPEN_NOTE_TEXT) });
      await openDay(PINNED_PLAIN);
      await selectDay(PINNED_DECORATED_UNOPENED);
      expect(await calendar.cell(PINNED_DECORATED_UNOPENED).getAttribute("data-active")).toBeNull();
      await expectLabelHex(
        daySelector(PINNED_DECORATED_UNOPENED),
        SELECTED_TEXT,
        `the selected decorated day did not paint its ${SELECTED_TEXT} over the decoration's ${DECORATED_TEXT}`,
      );
    });

    it("an Unchanged open note lets the selected text show on its day", async () => {
      await saveAppearance(baseline, { "wide.active.text.color": "unchanged" });
      await openDay(PINNED_DECORATED);
      await selectDay(PINNED_DECORATED);
      await expectLabelHex(
        daySelector(PINNED_DECORATED),
        SELECTED_TEXT,
        `the Unchanged open note did not let the selected ${SELECTED_TEXT} through`,
      );
    });

    it("Unchanged today keeps the week number's weight and part color", async () => {
      await saveAppearance(baseline, {
        "wide.today.text.color": "unchanged",
        "wide.weekNumber.color": custom(WEEK_NUMBER_TEXT),
        "wide.weekNumber.weight": "semibold",
      });
      const weekNumber = ".notes-month-view__week-number[data-today]";
      await $(weekNumber).waitForExist({ timeoutMsg: "the base view showed no week number for today's week" });
      expect(await $(weekNumber).getAttribute("data-active")).toBeNull();
      await expectLabelHex(
        weekNumber,
        WEEK_NUMBER_TEXT,
        `today's week number did not keep the part's ${WEEK_NUMBER_TEXT} under an Unchanged today`,
      );
      await expectLabelWeight(weekNumber, SEMIBOLD, "today's week number did not keep the part's semibold weight");
    });

    it("narrow none cancels a wide bold", async () => {
      await saveAppearance(baseline, {
        "wide.today.text.weight": "bold",
        "narrow.today.style": "none",
        "wide.date.weight": "semibold",
      });
      await forceBlockWidth(BASE_VIEW_ROOT, NARROW_WIDTH);
      const today = `${daySelector(PINNED_TODAY)}[data-today]`;
      await expectLabelWeight(today, SEMIBOLD, "a narrow none on today did not fall back to the date's semibold");
      await forceBlockWidth(BASE_VIEW_ROOT, WIDE_WIDTH);
      await expectLabelWeight(today, BOLD, "today at wide width did not keep its bold");
    });

    it("a public snippet text color beats a saved Unchanged", async () => {
      await saveAppearance(baseline, { "wide.today.text.color": "unchanged" });
      await moveSelectionOff(PINNED_TODAY, MARCH_SPARE);
      await browser.execute(
        (selector: string, attribute: string) => {
          document.querySelector(selector)?.setAttribute(attribute, "public-today");
        },
        BASE_VIEW_ROOT,
        PUBLIC_TODAY_ATTRIBUTE,
      );
      await expectLabelHex(
        `${daySelector(PINNED_TODAY)}[data-today]`,
        PUBLIC_TODAY_TEXT,
        `the public today text ${PUBLIC_TODAY_TEXT} did not beat the saved Unchanged`,
      );
    });
  });

  describe("on a today outside the month", () => {
    const today = `${OUTSIDE_VIEW_ROOT} ${daySelector(PINNED_TODAY)}[data-today][data-outside]`;

    before(async () => {
      await reloadObsidianOn(PINNED_TODAY, { vault: "./e2e-tests/fixtures/e2e-paint-order", plugins: ["journals"] });
      baseline = (await readRawSettings()) ?? "{}";
      await openOutsideView();
      expect(await $$(".notes-month-view").length).toBe(1);
      const before = await firstDayAnchor();
      await pageToNextMonth();
      await waitForState(firstDayAnchor, (anchor) => anchor !== before, "the outside-days view did not page to April");
      await $(today).waitForExist({ timeoutMsg: `April 2027 did not show ${PINNED_TODAY} as an outside today` });
      await moveSelectionOff(PINNED_TODAY, APRIL_SPARE);
    });

    afterEach(async () => {
      await forceBlockWidth(OUTSIDE_VIEW_ROOT, "");
    });

    after(closePopoutWindows);

    it("Unchanged today passes to the outside text", async () => {
      await saveAppearance(baseline, {
        "wide.today.text.color": "unchanged",
        "wide.outside.text.color": custom(OUTSIDE_TEXT),
      });
      await expectLabelHex(today, OUTSIDE_TEXT, `an Unchanged today did not pass to the outside ${OUTSIDE_TEXT}`);
    });

    it("narrow none on today passes to the outside weight", async () => {
      await saveAppearance(baseline, {
        "wide.today.text.weight": "bold",
        "narrow.today.style": "none",
        "wide.outside.text.weight": "normal",
        "wide.date.weight": "semibold",
      });
      await forceBlockWidth(OUTSIDE_VIEW_ROOT, NARROW_WIDTH);
      await expectLabelWeight(
        today,
        NORMAL,
        "a narrow none on an outside today did not pass to the outside state's normal weight",
      );
      await forceBlockWidth(OUTSIDE_VIEW_ROOT, WIDE_WIDTH);
      await expectLabelWeight(today, BOLD, "an outside today at wide width did not keep its bold");
    });
  });
});
