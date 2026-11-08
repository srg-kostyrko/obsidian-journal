import { browser } from "@wdio/globals";

import { LIVE_LEAF, MONTH_VIEW, openSeededCalendarView } from "../journeys/view.js";
import { reloadObsidianOn } from "../support/clock.js";
import { waitForState } from "../support/wait.js";

import { captureThemed, recordOutcome, widenRightSidebar } from "./capture.js";

// Each example is a real snippet in the fixture's .obsidian/snippets/, byte for byte the page's
// fence, switched on through Obsidian's own loader one at a time so no case reads another's values.

const TODAY = "2026-09-14";
const VIEW_ROOT = `${LIVE_LEAF} .journal-view-root`;
const BLOCK = `${VIEW_ROOT} .journal-view-month-calendar`;
const TODAY_CELL = `${MONTH_VIEW} .notes-calendar-cell[data-today]`;
const WEEKEND_FILL = `${MONTH_VIEW} .notes-calendar-band[data-band="weekend"] [data-layer="weekend-fill"]`;
const IN_MONTH_DAY = `${MONTH_VIEW} .notes-month-view__day:not([data-outside])`;
// A Saturday carrying a fixture note, so the stock has-note dot sits on the band.
const DECORATED_WEEKEND_DAY = "2026-09-05";
const WIDE = "40em";
const NARROW = "20em";

const SNIPPET_MARKER = {
  "today-background": "--journal-cell-today-strength",
  "weekend-band": "--journal-cell-weekend-strength",
  "narrow-rows": "--journal-cell-cell-min-height-narrow",
} as const;
type Snippet = keyof typeof SNIPPET_MARKER;

class ExampleMismatchError extends Error {
  constructor(example: string, outcome: unknown) {
    super(`the ${example} example did not do what the page says: ${JSON.stringify(outcome)}`);
    this.name = "ExampleMismatchError";
  }
}

class SnippetNotFoundError extends Error {
  constructor(name: string, known: readonly string[]) {
    super(`snippet ${name} is not in the vault's snippets folder: ${JSON.stringify(known)}`);
    this.name = "SnippetNotFoundError";
  }
}

interface CustomCss {
  snippets: string[];
  enabledSnippets: Set<string>;
  setCssEnabledStatus(name: string, enabled: boolean): void;
}

async function setSnippet(name: Snippet, enabled: boolean): Promise<void> {
  const known = await browser.executeObsidian(
    ({ app }) => (app as unknown as { customCss: CustomCss }).customCss.snippets,
  );
  if (!known.includes(name)) throw new SnippetNotFoundError(name, known);
  await browser.executeObsidian(
    ({ app }, snippet, on) => {
      (app as unknown as { customCss: CustomCss }).customCss.setCssEnabledStatus(snippet, on);
    },
    name,
    enabled,
  );
  // The loader reads the file asynchronously; the snippet is in force once body carries its variable.
  await waitForState(
    () =>
      browser.execute(
        (variable: string) => getComputedStyle(document.body).getPropertyValue(variable) !== "",
        SNIPPET_MARKER[name],
      ),
    (present) => present === enabled,
    `snippet ${name} did not turn ${enabled ? "on" : "off"}`,
  );
}

// waitForState, keeping the value that satisfied it.
async function readWhen<T>(read: () => Promise<T>, predicate: (value: T) => boolean, timeoutMsg: string): Promise<T> {
  let last: T | undefined;
  await waitForState(
    async () => {
      last = await read();
      return last;
    },
    predicate,
    timeoutMsg,
  );
  return last as T;
}

// A pointer left over a cell opens its tooltip, which the capture would keep, so park it at the window's
// bottom edge, clear of the calendar, and wait for any open tooltip to close.
async function settleForCapture(): Promise<void> {
  const viewport = await browser.execute(() => ({ width: window.innerWidth, height: window.innerHeight }));
  await browser
    .action("pointer")
    .move({ x: Math.round(viewport.width / 2), y: viewport.height - 4 })
    .perform();
  await waitForState(
    () => browser.execute(() => document.querySelectorAll(".tooltip").length),
    (open) => open === 0,
    "waited for an open tooltip to close",
  );
}

// A theme variable resolved to the rgb() Chromium computes for it, in the calendar's own context.
function resolveColor(variable: string): Promise<string> {
  return browser.execute(
    (scope: string, name: string) => {
      const host = document.querySelector(scope) ?? document.body;
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      host.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    },
    MONTH_VIEW,
    variable,
  );
}

interface Computed {
  found: boolean;
  values: Record<string, string>;
}

function computed(selector: string, properties: readonly string[]): Promise<Computed> {
  return browser.execute(
    (sel: string, names: readonly string[]) => {
      const element = document.querySelector(sel);
      if (element === null) return { found: false, values: {} };
      const style = getComputedStyle(element);
      return { found: true, values: Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)])) };
    },
    selector,
    properties,
  );
}

async function forceBlockWidth(width: string): Promise<void> {
  await browser.execute(
    (sel: string, forced: string) => {
      const block = document.querySelector<HTMLElement>(sel);
      if (block) block.style.width = forced;
    },
    BLOCK,
    width,
  );
  await waitForState(
    () =>
      browser.execute(
        (sel: string, forced: string) => {
          const block = document.querySelector<HTMLElement>(sel);
          if (!block) return false;
          if (forced === "") return true;
          const em = Number.parseFloat(getComputedStyle(block).fontSize);
          return Math.abs(block.getBoundingClientRect().width - Number.parseFloat(forced) * em) < 2;
        },
        BLOCK,
        width,
      ),
    (settled) => settled,
    `the month calendar did not settle at ${width || "its own width"}`,
  );
}

interface RowRead {
  blockWidthPx: number;
  minHeight: number | undefined;
  renderedHeight: number;
  dateFontSize: number | undefined;
}

const hundredths = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : Math.round(value * 100) / 100;

async function readRows(): Promise<RowRead> {
  const raw = await browser.execute(
    (blockSelector: string, daySelector: string) => {
      const block = document.querySelector<HTMLElement>(blockSelector);
      const day = document.querySelector<HTMLElement>(daySelector);
      const style = day ? getComputedStyle(day) : undefined;
      return {
        blockWidthPx: block?.getBoundingClientRect().width ?? 0,
        minHeight: style ? Number.parseFloat(style.minHeight) : undefined,
        renderedHeight: day?.getBoundingClientRect().height ?? 0,
        dateFontSize: style ? Number.parseFloat(style.fontSize) : undefined,
      };
    },
    BLOCK,
    IN_MONTH_DAY,
  );
  return {
    blockWidthPx: hundredths(raw.blockWidthPx) ?? 0,
    minHeight: hundredths(raw.minHeight),
    renderedHeight: hundredths(raw.renderedHeight) ?? 0,
    dateFontSize: hundredths(raw.dateFontSize),
  };
}

async function rowsAt(width: string): Promise<RowRead> {
  await forceBlockWidth(width);
  return readRows();
}

describe("CSS variables examples", () => {
  before(async () => {
    await reloadObsidianOn(TODAY, { vault: "./e2e-tests/fixtures/e2e-docs-css-variables", plugins: ["journals"] });
    await openSeededCalendarView();
    await widenRightSidebar(540, VIEW_ROOT);
    await waitForState(
      () => browser.execute((sel: string) => document.querySelectorAll(sel).length, `${MONTH_VIEW} .cell-marks`),
      (count) => count >= 7,
      "waited for the seeded notes' decorations to render on the month grid",
    );
  });

  describe("today with a background", () => {
    after(() => setSnippet("today-background", false));

    it("tints today orange inside the selected ring and keeps its accent text", async () => {
      const fill = `${TODAY_CELL} [data-layer="today-fill"]`;
      const selectedRing = `${TODAY_CELL} [data-layer="selected-ring"]`;
      const text = `${TODAY_CELL} > .notes-calendar-cell__text`;
      const stockFill = await computed(fill, ["background-color", "opacity"]);
      const stockText = await computed(text, ["color"]);

      await setSnippet("today-background", true);
      const orange = await resolveColor("--color-orange");
      const accent = await resolveColor("--text-accent");
      const fillRead = await readWhen(
        () => computed(fill, ["background-color", "opacity", "z-index"]),
        (read) => read.values.opacity === "0.3",
        "today's fill did not take the 0.3 strength",
      );
      const textRead = await computed(text, ["color"]);
      const ringRead = await computed(selectedRing, ["box-shadow"]);
      const ringShadow = ringRead.values["box-shadow"] ?? "";
      const ringWidth = /(-?[\d.]+)px inset/.exec(ringShadow)?.[1];
      // The seeded view's reference date is today, so a calendar marks today as the selected date too.
      const todaySelected = await browser.execute(
        (sel: string) => document.querySelector<HTMLElement>(sel)?.dataset.selected === "true",
        TODAY_CELL,
      );

      await settleForCapture();
      await captureThemed(MONTH_VIEW, "css-variables-today-background", { padding: 8 });

      const outcome = {
        today: TODAY,
        stockFill: stockFill.values,
        stockTextColor: stockText.values.color,
        snippetFill: fillRead.values,
        resolvedColorOrange: orange,
        fillIsOrange: fillRead.values["background-color"] === orange,
        snippetTextColor: textRead.values.color,
        resolvedTextAccent: accent,
        textKeepsAccent: textRead.values.color === accent,
        todayIsSelected: todaySelected,
        selectedRingBoxShadow: ringShadow,
        // Rounded: Obsidian's zoom scales authored pixels.
        selectedRingWidthPx: ringWidth === undefined ? undefined : Math.round(Number.parseFloat(ringWidth)),
      };
      await recordOutcome("css-variables-today-background", outcome);
      if (
        !outcome.fillIsOrange ||
        !outcome.textKeepsAccent ||
        !outcome.todayIsSelected ||
        outcome.selectedRingWidthPx !== 2
      )
        throw new ExampleMismatchError("today background", outcome);
    });
  });

  describe("a weekend band", () => {
    after(() => setSnippet("weekend-band", false));

    it("fills each run of weekend columns pale blue, under the decorations", async () => {
      const stockFill = await computed(WEEKEND_FILL, ["opacity", "background-color"]);

      await setSnippet("weekend-band", true);
      const blue = await resolveColor("--color-blue");
      const fill = await readWhen(
        () => computed(WEEKEND_FILL, ["background-color", "opacity", "z-index"]),
        (read) => read.values.opacity === "0.15",
        "the weekend band did not take the 0.15 strength",
      );
      const bands = await browser.execute(
        (root: string, day: string) => {
          const grid = document.querySelector(`${root} .notes-month-view__grid`);
          const all = [...document.querySelectorAll<HTMLElement>(`${root} .notes-calendar-band[data-band="weekend"]`)];
          const firstCell = grid?.querySelector(".notes-calendar-cell");
          const markedCell = grid?.querySelector<HTMLElement>(`.notes-calendar-cell[data-anchor="${CSS.escape(day)}"]`);
          const dot = markedCell?.querySelector(".cell-marks .place-center_bottom");
          return {
            count: all.length,
            columns: all.map((band) => band.style.gridColumn),
            rows: all.map((band) => band.style.gridRow),
            precedeCells:
              firstCell !== null &&
              firstCell !== undefined &&
              all.every((band) => (band.compareDocumentPosition(firstCell) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
            decoratedWeekendDay: day,
            decoratedDayIsWeekend: markedCell?.dataset.weekend === "true",
            decoratedDayHasDot: dot !== null && dot !== undefined,
            decoratedDayCellZIndex: markedCell ? getComputedStyle(markedCell).zIndex : undefined,
            decoratedDayCellPosition: markedCell ? getComputedStyle(markedCell).position : undefined,
          };
        },
        MONTH_VIEW,
        DECORATED_WEEKEND_DAY,
      );

      await settleForCapture();
      await captureThemed(MONTH_VIEW, "css-variables-weekend-band", { padding: 8 });

      const outcome = {
        stockFill: stockFill.values,
        snippetFill: fill.values,
        resolvedColorBlue: blue,
        fillIsBlue: fill.values["background-color"] === blue,
        bands,
      };
      await recordOutcome("css-variables-weekend-band", outcome);
      if (
        !outcome.fillIsBlue ||
        fill.values["z-index"] !== "0" ||
        bands.count === 0 ||
        !bands.precedeCells ||
        !bands.decoratedDayHasDot
      )
        throw new ExampleMismatchError("weekend band", outcome);
    });
  });

  describe("taller rows in narrow calendars", () => {
    after(async () => {
      await setSnippet("narrow-rows", false);
      await forceBlockWidth("");
    });

    it("gives narrow calendars 34px rows and the wide date size, and leaves wide ones alone", async () => {
      const stockWide = await rowsAt(WIDE);
      const stockNarrow = await rowsAt(NARROW);

      await setSnippet("narrow-rows", true);
      const snippetNarrow = await readWhen(
        () => rowsAt(NARROW),
        (read) => Math.round(read.minHeight ?? 0) === 34,
        "the narrow calendar's rows did not take the 34px min-height",
      );
      const snippetWide = await rowsAt(WIDE);

      const outcome = {
        widths: { wide: WIDE, narrow: NARROW },
        stockWide,
        stockNarrow,
        snippetNarrow,
        snippetWide,
        // Rounded: Obsidian's zoom scales authored pixels.
        narrowRowMinHeightPx: Math.round(snippetNarrow.minHeight ?? 0),
        narrowDateMatchesWideStock: snippetNarrow.dateFontSize === stockWide.dateFontSize,
        wideUnchanged:
          snippetWide.minHeight === stockWide.minHeight && snippetWide.dateFontSize === stockWide.dateFontSize,
      };
      await recordOutcome("css-variables-narrow-rows", outcome);
      if (outcome.narrowRowMinHeightPx !== 34 || !outcome.narrowDateMatchesWideStock || !outcome.wideUnchanged)
        throw new ExampleMismatchError("narrow rows", outcome);
    });
  });
});
