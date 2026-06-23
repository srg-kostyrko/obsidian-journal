import { colorToString } from "./ui/color";

import type {
  BorderSide,
  JournalDecorationCorner,
  JournalDecorationIcon,
  JournalDecorationShape,
  JournalDecorationStyle,
} from "./config";

export type Placement =
  | "left_top"
  | "left_middle"
  | "left_bottom"
  | "center_top"
  | "center_middle"
  | "center_bottom"
  | "right_top"
  | "right_middle"
  | "right_bottom";

export function backgroundFrom(styles: readonly JournalDecorationStyle[]): string {
  const hit = styles.find((s) => s.type === "background");
  return hit ? colorToString(hit.color) : "inherit";
}

export function textColorFrom(styles: readonly JournalDecorationStyle[]): string {
  const hit = styles.find((s) => s.type === "color");
  return hit ? colorToString(hit.color) : "inherit";
}

function toBorderStyleString(side: BorderSide): string {
  if (!side.show) return "none";
  return `${side.width}px ${side.style} ${colorToString(side.color)}`;
}

export function borderStylesFrom(styles: readonly JournalDecorationStyle[]): {
  borderTop: string;
  borderRight: string;
  borderBottom: string;
  borderLeft: string;
} {
  const result = { borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none" };
  for (const style of styles) {
    if (style.type !== "border") continue;
    if (style.border === "uniform") {
      const s = toBorderStyleString(style.left);
      if (s !== "none") {
        result.borderTop = s;
        result.borderRight = s;
        result.borderBottom = s;
        result.borderLeft = s;
      }
    } else {
      const top = toBorderStyleString(style.top);
      const right = toBorderStyleString(style.right);
      const bottom = toBorderStyleString(style.bottom);
      const left = toBorderStyleString(style.left);
      if (top !== "none") result.borderTop = top;
      if (right !== "none") result.borderRight = right;
      if (bottom !== "none") result.borderBottom = bottom;
      if (left !== "none") result.borderLeft = left;
    }
  }
  return result;
}

interface PaddingExtents {
  top: number;
  right: number;
  bottom: number;
  left: number;
  topBorder: number;
  rightBorder: number;
  bottomBorder: number;
  leftBorder: number;
}

function paddingExtentsFrom(styles: readonly JournalDecorationStyle[]): PaddingExtents {
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;
  let topBorder = 0;
  let rightBorder = 0;
  let bottomBorder = 0;
  let leftBorder = 0;

  for (const style of styles) {
    if (style.type === "background" || style.type === "color" || style.type === "corner") continue;
    if (style.type === "border") {
      if (style.border === "uniform") {
        const w = style.left.width;
        topBorder = Math.max(topBorder, w);
        rightBorder = Math.max(rightBorder, w);
        bottomBorder = Math.max(bottomBorder, w);
        leftBorder = Math.max(leftBorder, w);
      } else {
        topBorder = Math.max(topBorder, style.top.width);
        rightBorder = Math.max(rightBorder, style.right.width);
        bottomBorder = Math.max(bottomBorder, style.bottom.width);
        leftBorder = Math.max(leftBorder, style.left.width);
      }
      continue;
    }
    const size = style.size;
    if (style.placement_y === "top") top = Math.max(top, size);
    else if (style.placement_y === "bottom") bottom = Math.max(bottom, size);
    if (style.placement_x === "left") left = Math.max(left, size);
    else if (style.placement_x === "right") right = Math.max(right, size);
  }

  return { top, right, bottom, left, topBorder, rightBorder, bottomBorder, leftBorder };
}

function formatPaddingExtents(extents: PaddingExtents): string {
  return `max(${extents.top + 0.1}em, ${extents.topBorder + 2}px) max(${extents.right + 0.1}em, ${extents.rightBorder + 2}px) max(${extents.bottom + 0.1}em, ${extents.bottomBorder + 2}px) max(${extents.left + 0.1}em, ${extents.leftBorder + 2}px)`;
}

export function paddingFrom(styles: readonly JournalDecorationStyle[]): string {
  return formatPaddingExtents(paddingExtentsFrom(styles));
}

// Reserve the same padding on every cell — the per-side maximum across all cells — so a
// decoration on one cell shifts its content identically to its siblings instead of
// inflating only its own grid row (the v2 calendar kept rows aligned via fixed row height).
export function paddingFromAll(cellStyles: Iterable<readonly JournalDecorationStyle[]>): string {
  const merged: PaddingExtents = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    topBorder: 0,
    rightBorder: 0,
    bottomBorder: 0,
    leftBorder: 0,
  };
  for (const styles of cellStyles) {
    const extents = paddingExtentsFrom(styles);
    merged.top = Math.max(merged.top, extents.top);
    merged.right = Math.max(merged.right, extents.right);
    merged.bottom = Math.max(merged.bottom, extents.bottom);
    merged.left = Math.max(merged.left, extents.left);
    merged.topBorder = Math.max(merged.topBorder, extents.topBorder);
    merged.rightBorder = Math.max(merged.rightBorder, extents.rightBorder);
    merged.bottomBorder = Math.max(merged.bottomBorder, extents.bottomBorder);
    merged.leftBorder = Math.max(merged.leftBorder, extents.leftBorder);
  }
  return formatPaddingExtents(merged);
}

export function placedFrom(
  styles: readonly JournalDecorationStyle[],
): Record<Placement, (JournalDecorationShape | JournalDecorationIcon)[]> {
  const result: Record<Placement, (JournalDecorationShape | JournalDecorationIcon)[]> = {
    left_top: [],
    left_middle: [],
    left_bottom: [],
    center_top: [],
    center_middle: [],
    center_bottom: [],
    right_top: [],
    right_middle: [],
    right_bottom: [],
  };

  for (const style of styles) {
    if (style.type !== "shape" && style.type !== "icon") continue;
    const key = `${style.placement_x}_${style.placement_y}` as Placement;
    result[key].push(style);
  }
  return result;
}

export function cornersFrom(styles: readonly JournalDecorationStyle[]): JournalDecorationCorner[] {
  return styles.filter((s): s is JournalDecorationCorner => s.type === "corner");
}
