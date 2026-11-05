import { $, $$, browser, expect } from "@wdio/globals";

import {
  appearanceCatalog,
  publicName,
  type CatalogEntry,
} from "../../src/notes-calendar/appearance/appearance-catalog.js";
import { GATE_ATTRIBUTE, GATE_VIEW_ID } from "../../src/notes-calendar/appearance/gate-snippet.js";
import { closePopoutWindows, seedNote, waitForActiveNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { note } from "./decorations.js";

// The gate: every documented variable, set through a user snippet, must reach the element and
// property its catalog probe names. The fixture enables .obsidian/snippets/journal-gate.css, which
// is generated from the catalog and scopes each entry to the gate view root carrying
// data-appearance-gate="<entry>", so each case sets exactly one entry and its companions.

const GATE_ROOT = `[data-journal-view="${GATE_VIEW_ID}"]`;
// The fixture's own tooltip on the gate view's paging button, not a translated string.
const GATE_NEXT_MONTH = `${GATE_ROOT} [aria-label="Gate next month"]`;
const MAX_MONTH_STEPS = 3;
// The fixture also saves narrow values, which a public wide snippet does not beat by design, so the
// gate reads its calendar above the breakpoint.
const WIDE = "40em";

const V7_VIEW = "47e75fae-240a-410e-aecd-83797c50fc56";
const V7_ROOT = `[data-journal-view="${V7_VIEW}"]`;

const HIGHLIGHT_ATTRIBUTES = ["data-today", "data-selected", "data-active", "data-outside"] as const;
type HighlightAttribute = (typeof HIGHLIGHT_ATTRIBUTES)[number];

class AppearanceGateError extends Error {
  override name = "AppearanceGateError";
}

interface Probe {
  readonly selector: string;
  readonly property: string;
  readonly expect: string;
  // The highlight attributes the probed cell may carry; any other one is a state whose color or
  // weight could stand in for the value under test (today's beats the part color on today's date).
  readonly allowed: readonly HighlightAttribute[];
}

type ProbeRead =
  | { readonly found: true; readonly value: string; readonly expect: string; readonly color: boolean }
  | { readonly found: false; readonly reason: string };

interface ReadOptions {
  // Sets the gate attribute to this entry's name; without one the attribute is removed.
  readonly gate?: string;
  readonly width?: string;
}

function stateOf(entry: CatalogEntry): HighlightAttribute | undefined {
  const state = /^journal-cell-(today|selected|active|outside)-/.exec(entry.name)?.[1];
  return state === undefined ? undefined : (`data-${state}` as HighlightAttribute);
}

function probeOf(entry: CatalogEntry): Probe {
  const state = stateOf(entry);
  return { ...entry.probe, allowed: state === undefined ? [] : [state] };
}

// Reads each probe's computed value in the page, with every color in it, and the expected value
// when that is a color, normalized through a 1×1 canvas into one rgba() form: Chromium serializes
// color-mix as color(srgb …) on some versions of the supported range and rgba() on others.
async function readProbes(root: string, probes: readonly Probe[], options: ReadOptions = {}): Promise<ProbeRead[]> {
  return browser.execute(
    (
      rootSelector: string,
      list: readonly { selector: string; property: string; expect: string; allowed: readonly string[] }[],
      gate: string | null,
      width: string | null,
      attribute: string,
      highlights: readonly string[],
    ) => {
      const host = [...document.querySelectorAll<HTMLElement>(rootSelector)].find(
        (candidate) => candidate.getClientRects().length > 0,
      );
      if (host === undefined) return list.map(() => ({ found: false as const, reason: "no laid-out calendar root" }));
      host.removeAttribute(attribute);
      if (typeof gate === "string") host.setAttribute(attribute, gate);
      if (typeof width === "string") {
        const block = host.querySelector<HTMLElement>(".journal-view-month-calendar");
        if (block !== null) block.style.width = width;
      }
      const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      // A token the canvas cannot parse leaves fillStyle as it was, so a preset would pass for that
      // preset's color. Two different presets both surviving means the token was rejected, and the
      // raw token goes back unnormalized so no expectation can match it.
      const parses = (color: string): boolean =>
        ["#010203", "#040506"].some((preset) => {
          if (context === null) return false;
          context.fillStyle = preset;
          context.fillStyle = color;
          return context.fillStyle !== preset;
        });
      const rgba = (color: string): string => {
        if (context === null || !parses(color)) return color;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
        return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
      };
      const colorToken = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[\da-f]{3,8}\b/gi;
      return list.map(({ selector, property, expect, allowed }) => {
        const element = [...host.querySelectorAll<HTMLElement>(selector)].find((candidate) => {
          const cell = candidate.closest(".notes-calendar-cell");
          return cell === null || highlights.every((name) => allowed.includes(name) || !cell.hasAttribute(name));
        });
        if (element === undefined) return { found: false as const, reason: `no ${selector} free of other states` };
        const value = getComputedStyle(element)
          .getPropertyValue(property)
          .replaceAll(colorToken, (token) => rgba(token));
        const color = CSS.supports("color", expect);
        return { found: true as const, value, expect: color ? rgba(expect) : expect, color };
      });
    },
    root,
    probes,
    // WebDriver serializes undefined as null.
    options.gate ?? null,
    options.width ?? null,
    GATE_ATTRIBUTE,
    HIGHLIGHT_ATTRIBUTES,
  );
}

async function readProbe(root: string, probe: Probe, options: ReadOptions = {}): Promise<ProbeRead> {
  const [read] = await readProbes(root, [probe], options);
  return read ?? { found: false, reason: "no read" };
}

// A color matches as a substring of the normalized value. Anything else matches a whole token, px
// rounded (Obsidian's zoom scales authored pixels), so a 15px ring never satisfies 5px.
function matches(read: ProbeRead): boolean {
  if (!read.found) return false;
  if (read.color) return read.value.includes(read.expect);
  return read.value
    .split(/[\s,()]+/)
    .map((token) => (/^-?[\d.]+px$/.test(token) ? `${Math.round(Number.parseFloat(token))}px` : token))
    .includes(read.expect);
}

function shown(read: ProbeRead): string {
  return read.found ? `"${read.value}", expected to contain "${read.expect}"` : read.reason;
}

async function expectProbe(root: string, probe: Probe, label: string, options: ReadOptions = {}): Promise<void> {
  let last: ProbeRead = { found: false, reason: "never read" };
  await waitForState(
    async () => {
      last = await readProbe(root, probe, options);
      return last;
    },
    matches,
    label,
  ).catch(() => {
    throw new AppearanceGateError(`${label}: read ${shown(last)}`);
  });
}

async function openView(viewId: string, root: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, id) => {
    const leaf = app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: `journal-view:${id}`, active: true });
    await app.workspace.revealLeaf(leaf);
  }, viewId);
  await $(`${root} .notes-month-view__day`).waitForDisplayed({ timeoutMsg: `view ${viewId} showed no day cell` });
  // The in-page reads query the root, so the view must be mounted once.
  expect(await $$(root).length).toBe(1);
}

// A dispatched click, not a pointer click: the sidebar may still be settling after the view opens.
function clickCell(root: string, anchor: string, shiftKey: boolean): Promise<void> {
  return browser.execute(
    (rootSelector: string, cellAnchor: string, shift: boolean) => {
      document
        .querySelector<HTMLElement>(`${rootSelector} .notes-month-view__day[data-anchor="${CSS.escape(cellAnchor)}"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, shiftKey: shift }));
    },
    root,
    anchor,
    shiftKey,
  );
}

const cellAttribute = (root: string, anchor: string, name: string): Promise<string | null> =>
  $(`${root} .notes-month-view__day[data-anchor="${anchor}"]`).getAttribute(name);

// In-month days other than today, from the 2nd on. Never the 1st: the month heading's cell shares
// its anchor, so selecting it would put the heading in the selected state.
async function plainDays(root: string): Promise<string[]> {
  return browser.execute((rootSelector: string) => {
    return [
      ...document.querySelectorAll<HTMLElement>(
        `${rootSelector} .notes-month-view__day:not([data-outside]):not([data-today])`,
      ),
    ]
      .map((cell) => cell.dataset.anchor ?? "")
      .filter((anchor) => Number(anchor.slice(-2)) >= 2);
  }, root);
}

// Opens a seeded note from its day cell and waits until the cell shows it as the open note.
async function openNoteOn(root: string, anchor: string): Promise<void> {
  await seedNote(`day/${anchor}.md`, note("daily", anchor, "plain"));
  await clickCell(root, anchor, false);
  await waitForActiveNote(`day/${anchor}.md`);
  await waitForState(
    () => cellAttribute(root, anchor, "data-active"),
    (active) => active === "true",
    `the ${anchor} day cell did not become the open note`,
  );
}

async function selectDay(root: string, anchor: string): Promise<void> {
  await clickCell(root, anchor, true);
  await waitForState(
    () => cellAttribute(root, anchor, "aria-selected"),
    (selected) => selected === "true",
    `the ${anchor} day cell did not become selected`,
  );
}

const firstDayAnchor = (): Promise<string | null> =>
  $(`${GATE_ROOT} .notes-month-view__day`).getAttribute("data-anchor");

// Pages the gate view forward at least once, so no heading or week number is the current one, and
// until every probe finds a cell free of other states (a month with no outside day has none).
async function pageOffCurrentMonth(probes: readonly Probe[]): Promise<void> {
  for (let step = 1; step <= MAX_MONTH_STEPS; step++) {
    const before = await firstDayAnchor();
    await browser.execute((selector: string) => {
      document.querySelector<HTMLElement>(selector)?.click();
    }, GATE_NEXT_MONTH);
    await waitForState(firstDayAnchor, (anchor) => anchor !== before, "the gate view did not page to the next month");
    const reads = await readProbes(GATE_ROOT, probes, { width: WIDE });
    if (reads.every((read) => read.found)) return;
  }
  throw new AppearanceGateError(`no month within ${MAX_MONTH_STEPS} steps has a cell for every probe`);
}

// The open note, the selection and today are staged on the current month; outside days and the
// heading are read from a month paged off it, where nothing is today.
const onCurrentMonth = (entry: CatalogEntry): boolean => {
  const state = stateOf(entry);
  return state !== undefined && state !== "data-outside";
};

function gateCases(entries: readonly CatalogEntry[]): void {
  for (const entry of entries) {
    const probe = probeOf(entry);
    const { selector, property, sample } = entry.probe;
    it(`${publicName(entry)}: ${sample} reaches ${property} of ${selector}`, async () => {
      await expectProbe(GATE_ROOT, probe, `${publicName(entry)}: ${sample} did not reach ${property}`, {
        gate: entry.name,
        width: WIDE,
      });
      // The same element without the entry's scope must not show the sample: the snippet put it there.
      const without = await readProbe(GATE_ROOT, probe, { width: WIDE });
      expect(without.found).toBe(true);
      expect(matches(without)).toBe(false);
    });
  }
}

describe("every documented calendar variable is live", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-appearance-snippets", plugins: ["journals"] });
    await openView(GATE_VIEW_ID, GATE_ROOT);
  });

  after(closePopoutWindows);

  describe("on the current month", () => {
    before(async () => {
      const [open, selected] = await plainDays(GATE_ROOT);
      expect(open).toBeDefined();
      expect(selected).toBeDefined();
      await openNoteOn(GATE_ROOT, open ?? "");
      // Each state on its own day, and both off today.
      await selectDay(GATE_ROOT, selected ?? "");
      expect(await cellAttribute(GATE_ROOT, open ?? "", "aria-selected")).toBeNull();
    });

    gateCases(appearanceCatalog.filter((entry) => onCurrentMonth(entry)));
  });

  describe("on a month off the current one", () => {
    const entries = appearanceCatalog.filter((entry) => !onCurrentMonth(entry));

    before(async () => {
      await pageOffCurrentMonth(entries.map((entry) => probeOf(entry)));
    });

    gateCases(entries);
  });
});

function checkV7(
  selector: string,
  property: string,
  expected: string,
  allowed: readonly HighlightAttribute[],
): Promise<void> {
  return expectProbe(
    V7_ROOT,
    { selector, property, expect: expected, allowed },
    `${selector} ${property} is not ${expected}`,
  );
}

describe("calendar highlight colors saved at settings v7", () => {
  const today = ".notes-month-view__day[data-today]";
  let open = "";

  // The fixture saves custom today text and background, open-note text and background, and the
  // selected ring at version 7, with no snippet; the migration moves them into the v8 values.
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-appearance-v7", plugins: ["journals"] });
    await openView(V7_VIEW, V7_ROOT);
    const days = await plainDays(V7_ROOT);
    open = days.at(0) ?? "";
    expect(open).not.toBe("");
    await openNoteOn(V7_ROOT, open);
    // Selecting the open note's day moves the selection off today.
    await selectDay(V7_ROOT, open);
  });

  after(closePopoutWindows);

  it("today's text keeps the saved color", async () => {
    await checkV7(today, "color", "#1a2b3c", ["data-today"]);
  });

  it("today's fill keeps the saved background, at full strength", async () => {
    await checkV7(`${today} [data-layer="today-fill"]`, "background-color", "#4d5e6f", ["data-today"]);
    await checkV7(`${today} [data-layer="today-fill"]`, "opacity", "1", ["data-today"]);
  });

  it("the open note's fill keeps the saved background", async () => {
    await checkV7(
      `.notes-month-view__day[data-anchor="${open}"] [data-layer="active-fill"]`,
      "background-color",
      "#a1b2c3",
      ["data-active", "data-selected"],
    );
  });

  it("the open note's text keeps the saved color", async () => {
    await checkV7(`.notes-month-view__day[data-anchor="${open}"]`, "color", "#7a8b9c", [
      "data-active",
      "data-selected",
    ]);
  });

  it("the selected ring keeps the saved color", async () => {
    await checkV7(
      `.notes-month-view__day[data-anchor="${open}"] [data-layer="selected-ring"]`,
      "box-shadow",
      "#c4d5e6",
      ["data-active", "data-selected"],
    );
  });
});
