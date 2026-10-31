import { browser, expect } from "@wdio/globals";

import { UnsettledReadError } from "../support/errors.js";

import { openSeededCalendarView } from "./view.js";

interface Intrusion {
  slot: string;
  side: string;
  depth: number;
}

// The fixture decorates every weekday with one shape in each of the eight edge slots, and the
// selected date starts on today, so the selected cell carries a mark against every edge its ring
// is drawn on.
describe("decoration mark clearance", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-mark-clearance", plugins: ["journals"] });
  });

  it("keeps every edge mark off the selected-date ring", async () => {
    await openSeededCalendarView();

    // The ring's width is read off the cell rather than hardcoded: Obsidian's zoom scales authored
    // pixels, and both the shadow and the rects are measured in the same zoomed space.
    const found: (Intrusion[] | null)[] = [null];
    await browser.waitUntil(
      async () => {
        found[0] = await browser.execute(() => {
          const cell = document.querySelector(".notes-month-view__day[data-selected]");
          if (cell == null) return null;
          const places = [...cell.querySelectorAll(".cell-marks > .place")];
          if (places.length < 8) return null;
          const spread = /([\d.]+)px inset/.exec(getComputedStyle(cell).boxShadow);
          const ring = Number(spread?.[1] ?? NaN);
          if (!(ring > 0)) return null;
          const box = cell.getBoundingClientRect();
          const intrusions: Intrusion[] = [];
          for (const place of places) {
            const mark = place.querySelector(":scope > .shape-decoration")?.getBoundingClientRect();
            if (mark == null || mark.width === 0) return null;
            const slot = [...place.classList].find((name) => name.startsWith("place-")) ?? "?";
            const gaps = {
              top: mark.top - box.top,
              right: box.right - mark.right,
              bottom: box.bottom - mark.bottom,
              left: mark.left - box.left,
            };
            for (const [side, gap] of Object.entries(gaps)) {
              if (gap < ring) intrusions.push({ slot, side, depth: ring - gap });
            }
          }
          return intrusions;
        });
        return found[0] !== null;
      },
      { timeoutMsg: "the selected cell's marks never rendered" },
    );
    const intrusions = found[0];
    if (intrusions === null) throw new UnsettledReadError("the selected cell's marks");

    expect(intrusions).toEqual([]);
  });
});
