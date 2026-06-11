import { seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { calendar, openCalendarView } from "./view.js";

import type { CellLocator, PeriodTestId } from "./calendar.js";

// Custom hex (never theme vars) so the computed rgb is deterministic across the
// version matrix. These MUST match the fixture data.json style colors.
export const STYLE_HEX = {
  background: "#203040",
  color: "#112233",
  border: "#445566",
  shape: "#778899",
  corner: "#99aabb",
  icon: "#aabbcc",
} as const;

// Day-of-month is unique within the visible month, so each test owns one day cell.
// 02 is the seeded-note-free control. All <= 28 (in-month, non-spill, exist every month).
export const DECO_DAY = {
  control: 2,
  title: 7,
  tag: 10,
  property: 13,
  color: 16,
  border: 19,
  shape: 22,
  corner: 25,
  icon: 28,
} as const;

export function dayAnchor(day: number): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function note(journal: string, anchor: string, body = "", extraFrontmatter: readonly string[] = []): string {
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
  return {
    width: widthProp.value ?? "",
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
