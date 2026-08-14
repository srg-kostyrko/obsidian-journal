import { $, browser, expect } from "@wdio/globals";

import { getSettings, waitForSettings } from "../support/plugin-data.js";
import {
  clickButton,
  clickIcon,
  closeSettings,
  expandSection,
  openJournalSubpage,
  submitModal,
  waitForModalOpen,
} from "../support/settings.js";
import { seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { calendar, openCalendarView } from "./view.js";

import type { CalendarSurface, CellLocator, PeriodTestId } from "./calendar.js";

// Retyped rather than imported, which is debt, not a constraint: specs in this
// directory do import `m` from ../../src/i18n/paraglide/messages.js, and this
// file shares their module graph. Until it does, this MUST match
// decoration_explain_menu_item in messages/en.json.
export const EXPLAIN_MENU_ITEM = "Explain decorations";

// Custom hex (never theme vars) so the computed rgb is deterministic across the
// version matrix. These MUST match the fixture data.json style colors.
export const STYLE_HEX = {
  background: "#203040",
  color: "#112233",
  border: "#445566",
  shape: "#778899",
  corner: "#99aabb",
  icon: "#aabbcc",
  global: "#3a5f7d",
  precedenceJournal: "#40c040",
  precedenceGlobal: "#c04040",
} as const;

// Day-of-month is unique within the visible month, so each test owns one day cell.
// 02 is the seeded-note-free control. All <= 28 (in-month, non-spill, exist every month).
export const DECO_DAY = {
  control: 2,
  global: 3,
  precedence: 8,
  frontmatterTag: 5,
  bareTag: 6,
  title: 7,
  tag: 10,
  property: 13,
  color: 16,
  border: 19,
  shape: 22,
  corner: 25,
  icon: 28,
  // Owned by runStyleCanvasJourney below — a day none of the fixture's other daily
  // decorations key off, so it stays undecorated except for what the journey itself adds.
  styleCanvas: 27,
} as const;

export function dayAnchor(day: number): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function note(journal: string, anchor: string, body = "", extraFrontmatter: readonly string[] = []): string {
  const fm = [`journal: ${journal}`, `journal-date: ${anchor}`, ...extraFrontmatter];
  return `---\n${fm.join("\n")}\n---\n${body}\n`;
}

// Opens the view, reads each period cell's real anchor (= the journal-date to store),
// then hand-seeds the 12 precondition notes. The view re-evaluates decorations live
// off the resulting metadata/index events — no remount.
export async function seedDecorationFixture(): Promise<void> {
  await openCalendarView();
  const periodAnchor = async (testId: PeriodTestId): Promise<string> =>
    (await calendar.periodCell(testId).getAttribute("data-anchor")) ?? "";
  const week = await periodAnchor("week-number-cell");
  const month = await periodAnchor("header-month");
  const quarter = await periodAnchor("header-quarter");
  const year = await periodAnchor("header-year");

  // cspell:disable
  const titleDay = dayAnchor(DECO_DAY.title);
  await seedNote(`day/${titleDay}.md`, note("daily", titleDay));
  const tagDay = dayAnchor(DECO_DAY.tag);
  await seedNote(`day/${tagDay}.md`, note("daily", tagDay, "marker #ctag"));
  // Frontmatter tags reach the engine only through Obsidian's combined tag list, and a
  // bare (hash-less) value must still match a body tag — neither is provable in unit
  // tests, where the cache shape is our own stand-in.
  const frontmatterTagDay = dayAnchor(DECO_DAY.frontmatterTag);
  await seedNote(`day/${frontmatterTagDay}.md`, note("daily", frontmatterTagDay, "", ["tags:", "  - fmtag"]));
  const bareTagDay = dayAnchor(DECO_DAY.bareTag);
  await seedNote(`day/${bareTagDay}.md`, note("daily", bareTagDay, "marker #bodytag"));
  const propertyDay = dayAnchor(DECO_DAY.property);
  await seedNote(`day/${propertyDay}.md`, note("daily", propertyDay, "", ["cprop: present"]));
  const colorDay = dayAnchor(DECO_DAY.color);
  await seedNote(`day/${colorDay}.md`, note("daily", colorDay, "marker #scolor"));
  const borderDay = dayAnchor(DECO_DAY.border);
  await seedNote(`day/${borderDay}.md`, note("daily", borderDay, "marker #sborder"));
  const shapeDay = dayAnchor(DECO_DAY.shape);
  await seedNote(`day/${shapeDay}.md`, note("daily", shapeDay, "marker #sshape"));
  const cornerDay = dayAnchor(DECO_DAY.corner);
  await seedNote(`day/${cornerDay}.md`, note("daily", cornerDay, "marker #scorner"));
  const iconDay = dayAnchor(DECO_DAY.icon);
  await seedNote(`day/${iconDay}.md`, note("daily", iconDay, "marker #sicon"));
  // cspell:enable

  await seedNote("week/seed-weekly.md", note("weekly", week, "- [ ] open"));
  await seedNote("month/seed-monthly.md", note("monthly", month, "- [x] done"));
  await seedNote("quarter/seed-quarterly.md", note("quarterly", quarter));
  await seedNote("year/seed-yearly.md", note("yearly", year));
}

// --- contained-brittleness computed-style readers (rgb normalization in one place) ---

function decorationOf(cell: CellLocator): CellLocator {
  return cell.$('[data-testid="cell-decoration"]');
}

async function hexProp(el: CellLocator, property: string): Promise<string | undefined> {
  const cssProp = await el.getCSSProperty(property);
  const parsed = cssProp.parsed as { hex?: string };
  return parsed.hex;
}

export function decorationBackgroundHex(cell: CellLocator): Promise<string | undefined> {
  return hexProp(decorationOf(cell), "background-color");
}

export function decorationTextHex(cell: CellLocator): Promise<string | undefined> {
  return hexProp(decorationOf(cell), "color");
}

async function borderTop(cell: CellLocator): Promise<{ width: string; hex: string | undefined }> {
  const border = cell.$(".cell-decoration__border");
  const widthProp = await border.getCSSProperty("border-top-width");
  // Obsidian's default editor zoom scales the inline 3px down to a sub-pixel
  // value (e.g. 2.66667px); round back to the authored integer px so the
  // assertion stays deterministic across DPI/zoom.
  const px = typeof widthProp.parsed.value === "number" ? `${Math.round(widthProp.parsed.value)}px` : widthProp.value;
  return {
    width: px ?? "",
    hex: await hexProp(border, "border-top-color"),
  };
}

// The decoration applies only once the seeded note is indexed, so these poll (the
// .cell-decoration element exists from mount, but background/color stay "inherit"
// until the deco matches).
export function expectBackgroundHex(cell: CellLocator, hex: string): Promise<void> {
  return waitForState(
    () => decorationBackgroundHex(cell),
    (v) => v === hex,
    `waited for cell background ${hex}`,
  );
}

export function expectTextHex(cell: CellLocator, hex: string): Promise<void> {
  return waitForState(
    () => decorationTextHex(cell),
    (v) => v === hex,
    `waited for cell text color ${hex}`,
  );
}

export function expectBorderTop(cell: CellLocator, width: string, hex: string): Promise<void> {
  return waitForState(
    () => borderTop(cell),
    (b) => b.width === width && b.hex === hex,
    `waited for cell border-top ${width} ${hex}`,
  );
}

export function expectBackgroundCleared(cell: CellLocator, hex: string): Promise<void> {
  return waitForState(
    () => decorationBackgroundHex(cell),
    (v) => v !== hex,
    `waited for cell background to clear from ${hex}`,
  );
}

// The title / tag / property / open-task / all-tasks-completed conditions all render a
// top-left corner, so it is the single handle the live-edit tests watch: present once an
// edit makes the condition match, gone once the match is removed. waitForExist polls both
// directions off the event-driven re-eval (no remount), which is the seam under test.
const LIVE_DECORATION = ".decoration-corner.top-left";

export async function expectDecorated(cell: CellLocator): Promise<void> {
  await cell.$(LIVE_DECORATION).waitForExist({
    timeoutMsg: "expected the cell to gain its decoration after the edit",
  });
}

export async function expectUndecorated(cell: CellLocator): Promise<void> {
  await cell.$(LIVE_DECORATION).waitForExist({
    reverse: true,
    timeoutMsg: "expected the cell to lose its decoration after the edit",
  });
}

// The decoration matrix is mount-context-agnostic: the view leaf and the
// calendar-timeline code block render the same NotesMonthView/NotesCalendarCell grid,
// so the same assertions run against either surface (chunk 1 = view leaf, chunk 2 =
// timeline). Shelf-scope stays out — it drives the view-leaf toolbar, which the
// timeline has no equivalent of.
export function assertDecorationMatrix(surface: CalendarSurface): void {
  describe("condition decorations", () => {
    it("decorates a day cell whose note title matches the title condition", async () => {
      await surface.cell(dayAnchor(DECO_DAY.title)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "title-condition decoration did not render on the matching day cell",
      });
    });

    it("decorates a day cell whose note carries the matching tag", async () => {
      await surface.cell(dayAnchor(DECO_DAY.tag)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "tag-condition decoration did not render on the matching day cell",
      });
    });

    it("decorates a day cell whose tag comes from frontmatter rather than the body", async () => {
      await surface.cell(dayAnchor(DECO_DAY.frontmatterTag)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "frontmatter-tag decoration did not render on the matching day cell",
      });
    });

    it("decorates a day cell whose body tag matches a value typed without the hash", async () => {
      await surface.cell(dayAnchor(DECO_DAY.bareTag)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "hash-less tag-condition decoration did not render on the matching day cell",
      });
    });

    it("decorates a day cell whose note has the matching frontmatter property", async () => {
      await surface.cell(dayAnchor(DECO_DAY.property)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "property-condition decoration did not render on the matching day cell",
      });
    });

    it("decorates the configured day-of-month via the date condition", async () => {
      await surface.cell(dayAnchor(4)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "date-condition decoration did not render on the 4th",
      });
    });

    it("decorates the quarter header when the quarter journal has a note", async () => {
      await surface.periodCell("header-quarter").$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "has-note decoration did not render on the quarter header",
      });
    });

    it("decorates the week cell when its note has an open task", async () => {
      await surface.periodCell("week-number-cell").$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "has-open-task decoration did not render on the week cell",
      });
    });

    it("decorates the month header when its note's tasks are all completed", async () => {
      await surface.periodCell("header-month").$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "all-tasks-completed decoration did not render on the month header",
      });
    });

    it("leaves a cell with no matching note undecorated", async () => {
      // First prove the engine has run (a matched cell is decorated), then assert the
      // control cell — with no seeded note — carries no decoration.
      await surface.cell(dayAnchor(DECO_DAY.title)).$(".decoration-corner.top-left").waitForExist({
        timeoutMsg: "decoration engine never ran (title cell undecorated before the control assertion)",
      });
      await expect(surface.cell(dayAnchor(DECO_DAY.control)).$(".decoration-corner")).not.toExist();
    });
  });

  describe("style decorations", () => {
    it("renders the background color through Obsidian's real CSS cascade", async () => {
      await expectBackgroundHex(surface.periodCell("header-year"), STYLE_HEX.background);
    });

    it("renders the text color through Obsidian's real CSS cascade", async () => {
      await expectTextHex(surface.cell(dayAnchor(DECO_DAY.color)), STYLE_HEX.color);
    });

    it("renders the border through Obsidian's real CSS cascade", async () => {
      await expectBorderTop(surface.cell(dayAnchor(DECO_DAY.border)), "3px", STYLE_HEX.border);
    });

    it("renders a shape decoration element", async () => {
      await surface.cell(dayAnchor(DECO_DAY.shape)).$(".shape-decoration.shape-circle").waitForExist({
        timeoutMsg: "shape decoration did not render on the matching day cell",
      });
    });

    it("renders a corner decoration element at the configured placement", async () => {
      await surface.cell(dayAnchor(DECO_DAY.corner)).$(".decoration-corner.bottom-right").waitForExist({
        timeoutMsg: "corner-style decoration did not render at bottom-right",
      });
    });

    it("renders an icon decoration element", async () => {
      await surface.cell(dayAnchor(DECO_DAY.icon)).$(".icon-decoration").waitForExist({
        timeoutMsg: "icon decoration did not render on the matching day cell",
      });
    });
  });
}

// Obsidian's Menu exposes no ARIA roles, so .menu-item-title is the only stable handle on
// chrome we do not own. Dispatching the event directly avoids WDIO's own right-click, which
// also triggers Obsidian's editor context menu.
//
// A week anchor can coincide with a day anchor (calendar.ts documents the same hazard), and
// week-number cells are also NotesCalendarCells carrying data-anchor. With the fixture's
// `weeks: "left"` a week cell renders before its row's day cells, so a bare
// `[data-anchor="…"]` selector resolves to the week cell whenever the target day is the
// week's first day. Scoping to the day-grid wrapper (as calendar.ts's CalendarSurface.cell
// does) disambiguates it — every caller here targets a day cell.
export async function rightClickCell(anchor: string, daySelector = ".notes-month-view__day"): Promise<void> {
  const selector = `${daySelector}[data-anchor="${anchor}"]`;
  await browser.execute((sel: string) => {
    document.querySelector(sel)?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  }, selector);
}

export function menuItemTitles(): Promise<string[]> {
  return browser.execute(() => [...document.querySelectorAll(".menu-item-title")].map((el) => el.textContent ?? ""));
}

export async function closeAnyMenu(): Promise<void> {
  await browser.execute(() => {
    for (const menu of document.querySelectorAll(".menu")) menu.remove();
  });
}

// --- style canvas journey ---
//
// Everything above (assertDecorationMatrix, the fixture seed) renders decorations that were
// already sitting in data.json, either fixture-seeded or reached through non-canvas settings
// fields. None of that proves a click on a CANVAS REGION writes anything: the canvas only
// exists behind __mocks__/obsidian.ts in the unit suite, which mounts no canvas at all. This
// is the one place a region click is proven to reach data.json and that Obsidian's real CSS
// cascade renders the result back out.

// Retyped rather than imported (see above — nothing blocks the import; each of these is a
// paraglide message callable with its args object). They MUST match, in
// messages/en.json: decoration_modal_add_condition, decoration_condition_type_label
// (type=has-note — the ADD-CONDITION DROPDOWN's option text; decoration_condition_type_short
// names the row after the condition exists and is a different string), decoration_layer_chip_label
// (type=background/shape, state=empty), decoration_canvas_region_label (type=background),
// decoration_canvas_slot_label (slot=center_bottom).
const ADD_CONDITION_BUTTON = "Add condition";
const HAS_NOTE_CONDITION_OPTION = "Check if note exists";
const BACKGROUND_LAYER_CHIP = "Background";
const SHAPE_LAYER_CHIP = "Shape";
const CELL_BACKGROUND_REGION = "Cell background";
const BOTTOM_CENTER_SLOT = "Bottom center";

// Authored live through the canvas rather than seeded in fixture data.json, so it is kept
// separate from STYLE_HEX above. Distinct from every theme color so the render assertion
// cannot pass against a themed default.
export const STYLE_CANVAS_HEX = "#8844ff";

// UiColorSettingsPicker's color-kind <select> carries no aria-label of its own, but the
// canvas shows at most one style inspector at a time, so the class scope is unambiguous.
async function chooseCustomColorKind(): Promise<void> {
  await $(".ui-color-settings-picker select").selectByAttribute("value", "custom");
}

// input[type="color"] rejects typed keystrokes through the driver, and clicking it would pop
// an OS color-picker dialog WDIO cannot drive. Writing the value and firing the same "input"
// event Vue's v-model listens for is the only way to commit a hex through this control.
async function setCustomColorHex(hex: string): Promise<void> {
  await $('.ui-color-settings-picker input[type="color"]').waitForExist({
    timeoutMsg: "custom color input did not render after switching the color kind",
  });
  await browser.execute((value: string) => {
    const el = document.querySelector<HTMLInputElement>('.ui-color-settings-picker input[type="color"]');
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, hex);
}

// Authors a decoration entirely through canvas clicks (layer chip -> region -> custom hex,
// then a second layer chip -> mark slot), saves, closes settings, and asserts the calendar
// renders what was clicked. The persisted-count check proves the click reached data.json; the
// CSS + mark-placement checks prove the render pipeline picked the write back up. Assumes the
// caller has already opened settings (see settings.e2e.ts's beforeEach(openSettings)).
export async function runStyleCanvasJourney(): Promise<void> {
  const anchor = dayAnchor(DECO_DAY.styleCanvas);
  await seedNote(`day/${anchor}.md`, note("daily", anchor));

  const initial = await getSettings();
  const before = initial.journals?.daily?.decorations?.length ?? 0;

  await openJournalSubpage("core", "daily");
  await expandSection("Journal decorations");
  await clickIcon("Add decoration");
  await waitForModalOpen();

  await clickButton(ADD_CONDITION_BUTTON);
  await clickButton(HAS_NOTE_CONDITION_OPTION);

  await clickIcon(BACKGROUND_LAYER_CHIP);
  await clickIcon(CELL_BACKGROUND_REGION);
  await chooseCustomColorKind();
  await setCustomColorHex(STYLE_CANVAS_HEX);

  await clickIcon(SHAPE_LAYER_CHIP);
  await clickIcon(BOTTOM_CENTER_SLOT);

  await submitModal();
  await waitForSettings(
    (s) => (s.journals?.daily?.decorations?.length ?? 0) === before + 1,
    "canvas-authored decoration was not persisted to data.json",
  );
  await closeSettings();

  await openCalendarView();
  const cell = calendar.cell(anchor);
  await expectBackgroundHex(cell, STYLE_CANVAS_HEX);
  await cell.$(".place-center_bottom .shape-decoration.shape-circle").waitForExist({
    timeoutMsg: "shape decoration did not render at the bottom-center placement chosen on the canvas",
  });
}
