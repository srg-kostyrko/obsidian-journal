export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface PopoverOffset {
  readonly dx: number;
  readonly dy: number;
}

const EDGE_GAP = 4;

// The popover is laid out against its badge (`top: 100%; right: 0`) and then nudged by this
// offset, rather than positioned outright: `position: fixed` does not escape the surrounding
// scroll container, because an Obsidian leaf establishes a containing block for fixed
// descendants, and leaving the popover in the badge's subtree is what keeps the pointer's walk
// from badge to popover from firing the badge's mouseleave.
export function popoverOffset(badge: Box, popover: Box, clip: Box): PopoverOffset {
  const needed = Math.max(0, clip.left + EDGE_GAP - popover.left);
  const available = Math.max(0, clip.right - EDGE_GAP - popover.right);
  const height = popover.bottom - popover.top;
  const flips = popover.bottom > clip.bottom - EDGE_GAP && badge.top - height >= clip.top + EDGE_GAP;
  // Flush on whichever side it opens: a gap hit-tests to the cell behind and fires the badge's
  // mouseleave while the pointer is still crossing toward the popover.
  return { dx: Math.min(needed, available), dy: flips ? -(height + (badge.bottom - badge.top)) : 0 };
}

// The effective clip is every clipping ancestor intersected, not just the nearest one, so a
// popover inside nested scroll containers is measured against the box a reader can actually see.
export function clipBoxOf(element: HTMLElement): Box {
  const view = element.ownerDocument.defaultView;
  let box: Box = { left: 0, top: 0, right: view?.innerWidth ?? 0, bottom: view?.innerHeight ?? 0 };
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    // Empty as well as "visible": a real browser always resolves the keyword, but jsdom leaves
    // an unstyled element's overflow blank, and reading that as a clip intersects a zero rect.
    const overflow = view?.getComputedStyle(node).overflow ?? "";
    if (overflow === "" || overflow === "visible") continue;
    const rect = node.getBoundingClientRect();
    box = {
      left: Math.max(box.left, rect.left),
      top: Math.max(box.top, rect.top),
      right: Math.min(box.right, rect.right),
      bottom: Math.min(box.bottom, rect.bottom),
    };
  }
  return box;
}
