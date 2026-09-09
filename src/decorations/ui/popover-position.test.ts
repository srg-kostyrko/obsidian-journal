import { beforeAll, describe, expect, it, vi } from "vitest";

import { clipBoxOf, popoverOffset, type Box } from "./popover-position";

const CLIP: Box = { left: 700, top: 40, right: 1000, bottom: 800 };
const BADGE: Box = { left: 780, top: 300, right: 794, bottom: 310 };

function popoverAt(left: number, top: number, width = 60, height = 20): Box {
  return { left, top, right: left + width, bottom: top + height };
}

describe("popoverOffset", () => {
  it("leaves the popover where it lands when it already fits", () => {
    expect(popoverOffset(BADGE, popoverAt(734, 310), CLIP)).toEqual({ dx: 0, dy: 0 });
  });

  it("pushes the popover back inside when it crosses the clip's left edge", () => {
    expect(popoverOffset(BADGE, popoverAt(690, 310), CLIP).dx).toBe(14);
  });

  it("pushes no further than the room left of the clip's right edge", () => {
    const wider = { left: 300, top: 310, right: 996, bottom: 330 };

    expect(popoverOffset(BADGE, wider, CLIP).dx).toBe(0);
  });

  it("flips the popover flush above the badge when it would fall out of the clip's bottom", () => {
    const badge: Box = { left: 780, top: 770, right: 794, bottom: 780 };

    expect(popoverOffset(badge, popoverAt(734, 780), CLIP).dy).toBe(-30);
  });

  it("keeps the popover below when flipping would push it out of the clip's top", () => {
    const badge: Box = { left: 780, top: 50, right: 794, bottom: 60 };
    const clip: Box = { left: 700, top: 40, right: 1000, bottom: 70 };

    expect(popoverOffset(badge, popoverAt(734, 60), clip).dy).toBe(0);
  });
});

// getComputedStyle is stubbed rather than driven with real CSS: the lint rules ban both inline
// styles and an injected stylesheet, and what is under test is the intersection, not the cascade.
function clipper(overflow: string): HTMLDivElement {
  const element = document.createElement("div");
  element.dataset.overflow = overflow;
  return element;
}

function box(element: HTMLElement, rect: Box): void {
  element.getBoundingClientRect = (): DOMRect =>
    ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }) as DOMRect;
}

describe("clipBoxOf", () => {
  beforeAll(() => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (node) => ({ overflow: (node as HTMLElement).dataset.overflow ?? "visible" }) as CSSStyleDeclaration,
    );
  });

  it("falls back to the window when nothing above the element clips", () => {
    const element = document.createElement("span");
    document.body.append(element);

    expect(clipBoxOf(element)).toEqual({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
  });

  it("measures against a scrolling ancestor", () => {
    const scroller = clipper("auto");
    const element = document.createElement("span");
    scroller.append(element);
    document.body.append(scroller);
    box(scroller, { left: 700, top: 40, right: 1000, bottom: 700 });

    expect(clipBoxOf(element)).toEqual({ left: 700, top: 40, right: 1000, bottom: 700 });
  });

  it("intersects every clipping ancestor, not only the nearest", () => {
    const outer = clipper("hidden");
    const inner = clipper("auto");
    const element = document.createElement("span");
    inner.append(element);
    outer.append(inner);
    document.body.append(outer);
    box(outer, { left: 700, top: 40, right: 1000, bottom: 500 });
    box(inner, { left: 650, top: 100, right: 1200, bottom: 800 });

    expect(clipBoxOf(element)).toEqual({ left: 700, top: 100, right: 1000, bottom: 500 });
  });
});
