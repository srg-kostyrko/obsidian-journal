import type { JournalDecorationStyle } from "./config";

export type StyleSlotKey = JournalDecorationStyle["type"];

export type StyleFor<K extends StyleSlotKey> = Extract<JournalDecorationStyle, { type: K }>;

// Display order of the layer strip. Fills and strokes first, then the marks that sit on top.
export const STYLE_SLOT_KEYS: readonly StyleSlotKey[] = ["background", "color", "border", "shape", "icon", "corner"];

// A duplicated type resolves to the last, matching the cascade's last-wins rule for exclusive
// properties. Only a hand-edited data.json can produce one.
export function slotIndex(styles: readonly JournalDecorationStyle[], type: StyleSlotKey): number {
  return styles.findLastIndex((style) => style.type === type);
}

export function slotOf<K extends StyleSlotKey>(
  styles: readonly JournalDecorationStyle[],
  type: K,
): StyleFor<K> | undefined {
  const index = slotIndex(styles, type);
  return index === -1 ? undefined : (styles.at(index) as StyleFor<K>);
}

export function occupiedSlots(styles: readonly JournalDecorationStyle[]): ReadonlySet<StyleSlotKey> {
  return new Set(styles.map((style) => style.type));
}
