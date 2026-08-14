import { match } from "ts-pattern";

import { colorToString } from "./ui/color";

import type {
  BorderSide,
  JournalDecorationBorder,
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

export type CellMark = JournalDecorationShape | JournalDecorationIcon;

export interface CellBorder {
  readonly top: string;
  readonly right: string;
  readonly bottom: string;
  readonly left: string;
}

export interface PaddingExtents {
  top: number;
  right: number;
  bottom: number;
  left: number;
  topBorder: number;
  rightBorder: number;
  bottomBorder: number;
  leftBorder: number;
}

export interface ResolvedCell {
  readonly background: string;
  readonly textColor: string;
  readonly border: CellBorder;
  readonly corners: readonly JournalDecorationCorner[];
  readonly marks: Readonly<Record<Placement, readonly CellMark[]>>;
  readonly padding: PaddingExtents;
}

export type BorderSideName = keyof CellBorder;

const BORDER_SIDES: readonly BorderSideName[] = ["top", "right", "bottom", "left"];

function emptyMarks(): Record<Placement, CellMark[]> {
  return {
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
}

function zeroExtents(): PaddingExtents {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    topBorder: 0,
    rightBorder: 0,
    bottomBorder: 0,
    leftBorder: 0,
  };
}

// A hidden side abstains from the cascade rather than clearing it: a decoration that paints
// only a left accent must leave another decoration's top accent standing.
function sideString(side: BorderSide): string {
  return `${side.width}px ${side.style} ${colorToString(side.color)}`;
}

function applyBorder(
  border: Record<BorderSideName, string>,
  padding: PaddingExtents,
  style: JournalDecorationBorder,
): void {
  if (style.border === "uniform") {
    if (style.left.show) {
      const uniform = sideString(style.left);
      for (const side of BORDER_SIDES) border[side] = uniform;
    }
    const width = style.left.width;
    padding.topBorder = Math.max(padding.topBorder, width);
    padding.rightBorder = Math.max(padding.rightBorder, width);
    padding.bottomBorder = Math.max(padding.bottomBorder, width);
    padding.leftBorder = Math.max(padding.leftBorder, width);
    return;
  }
  for (const side of BORDER_SIDES) {
    if (!style[side].show) continue;
    border[side] = sideString(style[side]);
  }
  padding.topBorder = Math.max(padding.topBorder, style.top.width);
  padding.rightBorder = Math.max(padding.rightBorder, style.right.width);
  padding.bottomBorder = Math.max(padding.bottomBorder, style.bottom.width);
  padding.leftBorder = Math.max(padding.leftBorder, style.left.width);
}

function applyMarkPadding(padding: PaddingExtents, mark: CellMark): void {
  const { size } = mark;
  if (mark.placement_y === "top") padding.top = Math.max(padding.top, size);
  else if (mark.placement_y === "bottom") padding.bottom = Math.max(padding.bottom, size);
  if (mark.placement_x === "left") padding.left = Math.max(padding.left, size);
  else if (mark.placement_x === "right") padding.right = Math.max(padding.right, size);
}

// The cascade: decorations arrive vault-wide first and journal last, so plain overwriting
// resolves every exclusive property to its most specific declaration.
export function resolveCell(styles: readonly JournalDecorationStyle[]): ResolvedCell {
  let background = "inherit";
  let textColor = "inherit";
  const border: Record<BorderSideName, string> = { top: "none", right: "none", bottom: "none", left: "none" };
  const corners = new Map<JournalDecorationCorner["placement"], JournalDecorationCorner>();
  const marks = emptyMarks();
  const padding = zeroExtents();

  for (const style of styles) {
    match(style)
      .with({ type: "background" }, (s) => {
        background = colorToString(s.color);
      })
      .with({ type: "color" }, (s) => {
        textColor = colorToString(s.color);
      })
      .with({ type: "border" }, (s) => {
        applyBorder(border, padding, s);
      })
      .with({ type: "corner" }, (s) => {
        corners.set(s.placement, s);
      })
      .with({ type: "shape" }, { type: "icon" }, (s) => {
        marks[`${s.placement_x}_${s.placement_y}`].push(s);
        applyMarkPadding(padding, s);
      })
      .exhaustive();
  }

  return { background, textColor, border, corners: [...corners.values()], marks, padding };
}

// Each axis reserves the larger of its two sides on both: the cell centers its content in the
// padding box, so reserving on one side alone would push the text off the cell's own centre.
export function formatPadding(extents: PaddingExtents): string {
  const vertical = axisReservation(
    Math.max(extents.top, extents.bottom),
    Math.max(extents.topBorder, extents.bottomBorder),
  );
  const horizontal = axisReservation(
    Math.max(extents.left, extents.right),
    Math.max(extents.leftBorder, extents.rightBorder),
  );
  return `${vertical} ${horizontal}`;
}

function axisReservation(mark: number, border: number): string {
  return `max(${mark + 0.1}em, ${border + 2}px)`;
}

// Reserve the same padding on every cell — the per-side maximum across all cells — so a
// decoration on one cell shifts its content identically to its siblings instead of
// inflating only its own grid row.
export function mergePadding(all: Iterable<PaddingExtents>): PaddingExtents {
  const merged = zeroExtents();
  for (const extents of all) {
    merged.top = Math.max(merged.top, extents.top);
    merged.right = Math.max(merged.right, extents.right);
    merged.bottom = Math.max(merged.bottom, extents.bottom);
    merged.left = Math.max(merged.left, extents.left);
    merged.topBorder = Math.max(merged.topBorder, extents.topBorder);
    merged.rightBorder = Math.max(merged.rightBorder, extents.rightBorder);
    merged.bottomBorder = Math.max(merged.bottomBorder, extents.bottomBorder);
    merged.leftBorder = Math.max(merged.leftBorder, extents.leftBorder);
  }
  return merged;
}

export type ExclusiveProperty =
  | "background"
  | "textColor"
  | "border.top"
  | "border.right"
  | "border.bottom"
  | "border.left"
  | "corner.top-left"
  | "corner.top-right"
  | "corner.bottom-left"
  | "corner.bottom-right";

// Which exclusive properties a style competes for. A hidden border side abstains, so it
// declares nothing; marks never compete, so they declare nothing either.
export function declaredProperties(style: JournalDecorationStyle): readonly ExclusiveProperty[] {
  return match<JournalDecorationStyle, readonly ExclusiveProperty[]>(style)
    .with({ type: "background" }, () => ["background"])
    .with({ type: "color" }, () => ["textColor"])
    .with({ type: "border" }, (s) => {
      if (s.border === "uniform") {
        return s.left.show ? ["border.top", "border.right", "border.bottom", "border.left"] : [];
      }
      return BORDER_SIDES.filter((side) => s[side].show).map((side) => `border.${side}` as ExclusiveProperty);
    })
    .with({ type: "corner" }, (s) => [`corner.${s.placement}` as ExclusiveProperty])
    .with({ type: "shape" }, { type: "icon" }, () => [])
    .exhaustive();
}
