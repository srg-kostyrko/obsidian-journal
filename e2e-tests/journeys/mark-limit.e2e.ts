import { type $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { UnsettledReadError } from "../support/errors.js";

import { dayAnchor } from "./decorations.js";
import { calendar, openSeededCalendarView } from "./view.js";

const DAY = 14;

// Every geometry read below runs through this. The view mounts its cells before their decorations,
// so a `browser.execute` measurement taken straight after openSeededCalendarView() can find no
// marks and return null — and a bare `expect(x).not.toBeNull()` on that first answer turns "not
// painted yet" into a failure. Polling the reader is the difference between the two.
async function settled<T>(read: () => Promise<T | null>, what: string): Promise<T> {
  const found: (T | null)[] = [null];
  await browser.waitUntil(
    async () => {
      found[0] = await read();
      return found[0] !== null;
    },
    { timeoutMsg: `${what} never rendered` },
  );
  const value = found[0];
  if (value === null) throw new UnsettledReadError(what);
  return value;
}

type HoverTarget = ReturnType<typeof $>;

// The popover lives only while the pointer sits on its badge, and the pointer is session state. A
// sibling worker's Obsidian boot can cover this window at any moment; the OS then reports the
// pointer gone, the badge's mouseleave unmounts the popover, and a pointer that has not moved never
// reopens it. So no read trusts a hover it did not just make: every attempt parks the pointer off
// the grid, lets the previous popover close, and crosses into the badge afresh. False means the
// leftover is still open, and the caller's poll tries again.
async function hoverAfresh(badge: HoverTarget, popover: HoverTarget): Promise<boolean> {
  await browser.action("pointer").move({ duration: 0, x: 0, y: 0 }).perform();
  if (await popover.isExisting()) return false;
  await badge.moveTo();
  return true;
}

// The popover-walk test fails on a nightly leg now and then with the popover simply gone, and does
// not reproduce locally. Every way it can go is a different event: a point that misses the popover
// hit-tests elsewhere, a real crossing out fires the badge's mouseleave toward that element, the OS
// taking the pointer or focus away fires one with no related target or a blur, and a re-render
// detaches the badge.
// So the trail goes to the page console, which afterTest writes out only when the test fails.
async function recordPopoverLoss(anchor: string, target: { x: number; y: number }): Promise<void> {
  await browser.execute(
    (cellAnchor: string, x: number, y: number) => {
      const badge = document.querySelector(
        `.notes-month-view__day[data-anchor="${CSS.escape(cellAnchor)}"] .place-right_top [data-testid="mark-overflow"]`,
      );
      const start = performance.now();
      const log = (line: string): void => {
        console.debug("[e2e]", "mark-limit", `+${Math.round(performance.now() - start)}ms ${line}`);
      };

      const popover = badge?.querySelector('[data-testid="mark-overflow-popover"]');
      const hit = document.elementFromPoint(x, y);
      log(
        `before move: target=${x},${y} badge=${JSON.stringify(badge?.getBoundingClientRect())} ` +
          `popover=${JSON.stringify(popover?.getBoundingClientRect())} hit=${hit?.tagName}.${hit?.className} ` +
          `inPopover=${popover?.contains(hit) ?? false} focus=${document.hasFocus()}`,
      );
      // Every retry re-records the hit test, but the listeners go on once, or one loss logs N times.
      if (!(badge instanceof HTMLElement) || badge.dataset.e2eTrail !== undefined) return;
      badge.dataset.e2eTrail = "";

      badge.addEventListener("mouseleave", (mouse) => {
        const related = mouse.relatedTarget as Element | null;
        log(
          `badge mouseleave trusted=${mouse.isTrusted} at=${mouse.clientX},${mouse.clientY} ` +
            `related=${related?.tagName}.${related?.className} focus=${document.hasFocus()}`,
        );
      });
      window.addEventListener("blur", () => log("window blur"), { once: true });
      const detach = new MutationObserver(() => {
        if (badge.isConnected) return;
        log("badge detached");
        detach.disconnect();
      });
      detach.observe(document.body, { childList: true, subtree: true });
    },
    anchor,
    target.x,
    target.y,
  );
}

// The fixture pins the limit to 3 and decorates every weekday twice over, so every visible day
// cell overflows without seeding a note: five small shapes in right_top, and twelve more in
// left_bottom, whose badge sits against the cell's left edge and opens a popover wide enough to
// reach past the surface. The two groups take different rows of the cell so neither slot's marks
// overhang the other's badge, which would send a hover to the wrong one.
describe("decoration mark limit", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-mark-limit", plugins: ["journals"] });
  });

  it("draws the cap minus the badge, and the badge counts the rest", async () => {
    await openSeededCalendarView();

    const cell = calendar.cell(dayAnchor(DAY));
    await expect(cell.$$(".place-right_top .shape-decoration")).toBeElementsArrayOfSize(2);

    const badge = cell.$('.place-right_top [data-testid="mark-overflow"]');
    await expect(badge).toHaveText(m.decoration_mark_overflow_badge({ count: 3 }));
  });

  it("lines the badge up with the marks it follows", async () => {
    await openSeededCalendarView();

    const centers = await settled(
      () =>
        browser.execute((anchor: string) => {
          const selector = `.notes-month-view__day[data-anchor="${CSS.escape(anchor)}"] .place-right_top`;
          const slot = document.querySelector(selector);
          const mark = slot?.querySelector(":scope > .shape-decoration")?.getBoundingClientRect();
          const badge = slot?.querySelector('[data-testid="mark-overflow"]')?.getBoundingClientRect();
          return mark == null || badge == null
            ? null
            : { mark: mark.top + mark.height / 2, badge: badge.top + badge.height / 2 };
        }, dayAnchor(DAY)),
      "the right_top mark and its badge",
    );

    expect(Math.abs(centers.mark - centers.badge)).toBeLessThanOrEqual(1);
  });

  it("reveals the marks the badge hides when it is hovered", async () => {
    await openSeededCalendarView();

    const cell = calendar.cell(dayAnchor(DAY));
    const badge = cell.$('.place-right_top [data-testid="mark-overflow"]');
    await badge.waitForDisplayed({ timeoutMsg: "the overflow badge did not render" });
    const popover = cell.$('.place-right_top [data-testid="mark-overflow-popover"]');

    // moveTo() resolves the badge's centre at call time, so a hover sent while the grid is still
    // laying its marks out lands beside the badge and is simply lost — there is no second pointer
    // event to recover it. Re-hover until the popover opens rather than hovering once and waiting.
    // The reading comes back from that same poll, in one in-page call, because a decoration
    // re-render replaces the nodes both the popover and the cell's marks are made of: resolving an
    // element on one round trip and reading its box on the next hit that gap as a stale-element
    // failure on a nightly leg. Re-hovering is what the retry needs — a replaced badge sits under
    // a pointer that has not moved, so no mouseenter reopens the popover on its own.
    const marks = await settled(async () => {
      if (!(await hoverAfresh(badge, popover))) return null;
      return browser.execute((anchor: string) => {
        const selector = `.notes-month-view__day[data-anchor="${CSS.escape(anchor)}"] .place-right_top`;
        const slot = document.querySelector(selector);
        const popover = slot?.querySelector('[data-testid="mark-overflow-popover"]');
        const popoverMark = popover?.querySelector(".shape-decoration");
        // Scoped to a direct child of .place-right_top: the popover's own marks also live under
        // that place span (nested inside .mark-overflow), so a descendant selector would match the
        // popover copy first and compare it against itself.
        const cellMark = slot?.querySelector(":scope > .shape-decoration");
        if (popover == null || popoverMark == null || cellMark == null) return null;
        // Placement is measured a tick after mount, once the marks' sizes are written; a fresh
        // hover read before then would compare a popover mark that has no size yet.
        if (!popover.classList.contains("mark-overflow__popover--placed")) return null;
        const cellHeight = cellMark.getBoundingClientRect().height;
        // A mark still waiting on layout measures zero, and the ratio below is satisfied by two
        // zeroes — so an unmeasured mark is "not painted yet", the same as a missing one.
        if (cellHeight === 0) return null;
        return {
          hidden: popover.querySelectorAll(".shape-decoration").length,
          popoverHeight: popoverMark.getBoundingClientRect().height,
          cellHeight,
        };
      }, dayAnchor(DAY));
    }, "the overflow popover's marks");

    expect(marks.hidden).toBe(3);
    // The popover must render marks larger, at a readable size — assert the ratio, never an
    // absolute pixel height, since Obsidian's editor zoom scales authored pixels. Height, not
    // width: .place is a flex row inside a minmax(0, 1fr) grid column, so in a cell this narrow
    // (31px across in the seeded sidebar view, where the badge alone is wider than its third) the
    // cell's marks shrink to zero width while keeping their height. Comparing widths compared
    // nothing — any popover width cleared `0 * 2`. The popover's font-size is what enlarges them
    // and the marks are sized in `em`, so height is the dimension that carries the behavior.
    expect(marks.popoverHeight).toBeGreaterThanOrEqual(marks.cellHeight * 2);
  });

  it("keeps the popover open as the pointer moves from the badge into it", async () => {
    await openSeededCalendarView();

    const cell = calendar.cell(dayAnchor(DAY));
    const badge = cell.$('.place-right_top [data-testid="mark-overflow"]');
    await badge.waitForDisplayed({ timeoutMsg: "the overflow badge did not render" });

    const popover = cell.$('.place-right_top [data-testid="mark-overflow-popover"]');

    // The test above leaves the pointer parked on this same badge with its popover still open, and
    // the popover opens on `mouseenter`, which never fires again for a pointer that has not left —
    // so every attempt starts from a real crossing (hoverAfresh), never from inherited state.
    // The whole walk is one attempt: hover, wait for the popover's placement, step one pixel past
    // the badge, check the popover survived. A hover lost anywhere in it is re-driven by the next
    // attempt rather than waited out. A popover that is not flush with its badge fails every
    // attempt, so the behavior stays falsifiable.
    // The popover element is rendered before its placement offset is computed, and it stays
    // `visibility: hidden` until then. Moving the pointer while it is hidden lands on the cell
    // behind, fires the badge's mouseleave, and unmounts the popover before the pointer can walk
    // into it. So the walk starts only from a displayed popover.
    await browser.waitUntil(
      async () => {
        if (!(await hoverAfresh(badge, popover))) return false;
        if (!(await popover.isDisplayed())) return false;

        // Read the badge's box after the hover, so it is the settled one the pointer is sitting in.
        // One pixel past its border box: with the popover flush against the badge that point lands
        // inside the popover; with any gap it lands in the calendar cell behind, which is not a
        // descendant of the badge and fires its mouseleave.
        const location = await badge.getLocation();
        const size = await badge.getSize();
        const badgeCenterX = Math.round(location.x + size.width / 2);
        const justBelowBadge = Math.round(location.y + size.height) + 1;

        await recordPopoverLoss(dayAnchor(DAY), { x: badgeCenterX, y: justBelowBadge });
        await browser.action("pointer").move({ duration: 0, x: badgeCenterX, y: justBelowBadge }).perform();
        return popover.isExisting();
      },
      { timeoutMsg: "the popover closed as the pointer moved from the badge into it" },
    );
  });

  // A popover hangs off its badge's right edge, so the left_bottom badge of a first-column cell
  // opens one that reaches past the surface it draws over — the seeded view's right sidebar here.
  it("keeps the popover inside the surface it opens over", async () => {
    await openSeededCalendarView();

    const anchor = await settled(
      () =>
        browser.execute(() => {
          let leftmost: Element | null = null;
          for (const badge of document.querySelectorAll('.place-left_bottom [data-testid="mark-overflow"]')) {
            const closer =
              leftmost === null || badge.getBoundingClientRect().left < leftmost.getBoundingClientRect().left;
            if (closer) leftmost = badge;
          }
          const cell = leftmost?.closest("[data-anchor]");
          return cell instanceof HTMLElement ? (cell.dataset.anchor ?? null) : null;
        }),
      "a left_bottom overflow badge",
    );

    const cell = calendar.cell(anchor);
    const badge = cell.$('.place-left_bottom [data-testid="mark-overflow"]');
    await badge.waitForDisplayed({ timeoutMsg: "the left_bottom overflow badge did not render" });
    const popover = cell.$('.place-left_bottom [data-testid="mark-overflow-popover"]');

    // The hover and the read are one attempt, so a popover lost between them is re-hovered, not
    // waited out. Only a placed popover counts: before its offset lands it sits where it would
    // overflow, which is the very edge this test measures.
    const edges = await settled(async () => {
      if (!(await hoverAfresh(badge, popover))) return null;
      return browser.execute((cellAnchor: string) => {
        const el = document.querySelector(
          `[data-anchor="${CSS.escape(cellAnchor)}"] .place-left_bottom [data-testid="mark-overflow-popover"]`,
        );
        const leaf = el?.closest(".workspace-leaf-content");
        return el == null || leaf == null || !el.classList.contains("mark-overflow__popover--placed")
          ? null
          : { popover: el.getBoundingClientRect().left, leaf: leaf.getBoundingClientRect().left };
      }, anchor);
    }, "the popover and the surface it draws over");

    expect(edges.popover).toBeGreaterThanOrEqual(edges.leaf);
  });
});
