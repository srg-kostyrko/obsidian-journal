import { $, browser } from "@wdio/globals";

import { waitForState } from "../support/wait.js";

export type CellLocator = ReturnType<typeof $>;
export type PeriodTestId = "header-month" | "header-quarter" | "header-year" | "week-number-cell";

export interface CalendarSurface {
  // A day number repeats across month spill, so day cells are pinned by the
  // data-anchor production hook and scoped to the day grid (a week anchor can
  // coincide with a day anchor; .notes-month-view__day disambiguates).
  cell(anchor: string): CellLocator;
  // Header (month/quarter/year) and week-number cells carry production data-testid
  // hooks. The three header cells render once each; week-number-cell repeats per
  // row, so $() resolves to the first week — fine while callers only need "a week
  // note", not a specific row.
  periodCell(testId: PeriodTestId): CellLocator;
  // The cell flips data-active="true" off the live active-note-changed event — poll.
  waitForActive(anchor: string): Promise<void>;
}

// Binds the calendar mount root once so cell-finding isn't re-threaded through every
// call. The view-leaf and (chunk 2) code-block mounts each construct one against
// their own root and share every method.
// The day-cell scope differs per mount: the month grid wraps each cell in
// `.notes-month-view__day`; the week view renders bare `.notes-calendar-cell`s in its
// row. Callers pass the scope so a week anchor that coincides with a day anchor never
// resolves to the wrong cell.
export function calendarSurface(root: string, daySelector = ".notes-month-view__day"): CalendarSurface {
  const cell = (anchor: string): CellLocator => $(`${root} ${daySelector}[data-anchor="${anchor}"]`);
  const periodCell = (testId: PeriodTestId): CellLocator => $(`${root} [data-testid="${testId}"]`);
  const waitForActive = (anchor: string): Promise<void> =>
    waitForState(
      async () => (await cell(anchor).getAttribute("data-active")) ?? undefined,
      (active) => active === "true",
      `waited for the ${anchor} day cell to become data-active`,
    );
  return { cell, periodCell, waitForActive };
}

// A cell label's own color, or a theme variable as that cell would resolve it: a probe inside the
// cell's parent, so the same body and view scoping apply.
export type ColorSource = { readonly label: string } | { readonly variable: string; readonly near: string };

// Reads every color in one call, so a label and the reference it is compared to come from the same
// frame, and normalizes each to hex through CSS alone. The label's color goes through color-mix,
// which WebDriver cannot parse to hex; resolving a color through color-mix(in srgb) onto a probe
// gives one color(srgb …) form whatever the source syntax, parsed here. A canvas pixel read did
// this before and is out on purpose: a context that loses its backing returns zeroed pixels, which read
// as #000000. A value that does not resolve comes back raw, so it can never equal a hex.
export async function readColors<K extends string>(
  sources: Record<K, ColorSource>,
): Promise<Record<K, string | undefined>> {
  const entries = (Object.keys(sources) as K[]).map((key) => ({ key, source: sources[key] }));
  const read = await browser.execute((entries: { key: string; source: ColorSource }[]) => {
    const resolved: Record<string, string | null> = {};
    const probe = document.createElement("span");
    document.body.append(probe);
    for (const { key, source } of entries) {
      let raw: string | null = null;
      if ("label" in source) {
        const label = document.querySelector(`${source.label} .cell-decoration__content`);
        if (label !== null) raw = getComputedStyle(label).color;
      } else {
        const host = document.querySelector(source.near)?.parentElement;
        if (host != null) {
          const scoped = document.createElement("span");
          scoped.style.color = `var(${source.variable})`;
          host.append(scoped);
          raw = getComputedStyle(scoped).color;
          scoped.remove();
        }
      }
      if (raw === null) {
        resolved[key] = null;
        continue;
      }
      probe.style.color = "";
      probe.style.color = `color-mix(in srgb, ${raw} 100%, transparent)`;
      const srgb = /^color\(srgb (\S+) (\S+) (\S+)(?: \/ (\S+))?\)$/.exec(getComputedStyle(probe).color);
      const channels = srgb?.slice(1, 4).map(Number);
      if (
        probe.style.color === "" ||
        channels === undefined ||
        srgb?.[4] !== undefined ||
        channels.some(Number.isNaN)
      ) {
        resolved[key] = `unresolved ${raw}`;
        continue;
      }
      resolved[key] = `#${channels
        .map((channel) =>
          Math.round(Math.min(1, Math.max(0, channel)) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
    }
    probe.remove();
    return resolved;
  }, entries);
  const colors: Partial<Record<K, string>> = {};
  for (const { key } of entries) colors[key] = read[key] ?? undefined;
  return colors as Record<K, string | undefined>;
}

export async function labelHexOf(cellSelector: string): Promise<string | undefined> {
  const { label } = await readColors({ label: { label: cellSelector } });
  return label;
}
