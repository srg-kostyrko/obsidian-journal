import type { JournalDecorationStyle } from "../config";
import type { InjectionKey, Ref, ShallowRef } from "vue";

export type CellStyleRef = ShallowRef<readonly JournalDecorationStyle[]>;

export type CellDecorationMap = ReadonlyMap<string, CellStyleRef>;
export type CellDecorationMapInjectionKey = InjectionKey<CellDecorationMap>;
export type CellPaddingInjectionKey = InjectionKey<Ref<string>>;

// A scope is one provide/inject pairing: the cell-style map plus its shared padding. Most
// surfaces use the single default scope; a surface that needs two independently-scoped grids
// (the nav block: whole-block vs per-row) provides each map under its own scope.
export interface CellDecorationScope {
  readonly map: CellDecorationMapInjectionKey;
  readonly padding: CellPaddingInjectionKey;
}

// Keyed by cellKey(period.kind, anchor) — see engine.ts. A bare anchor would collide a
// week cell with the day cell that shares its anchor date.
export const CellDecorationMapKey: CellDecorationMapInjectionKey = Symbol("decorations:cell-map");

// One padding reservation shared by every cell in a decorated grid, so a decoration on a
// single cell never inflates only its own row. Provided by useCellDecorations.
export const CellPaddingKey: CellPaddingInjectionKey = Symbol("decorations:cell-padding");

export const defaultCellDecorationScope: CellDecorationScope = { map: CellDecorationMapKey, padding: CellPaddingKey };

// A fresh scope for a surface that needs more than one independently-scoped grid in the same
// subtree. `label` only names the symbols for debugging.
export function createCellDecorationScope(label: string): CellDecorationScope {
  return { map: Symbol(`decorations:cell-map:${label}`), padding: Symbol(`decorations:cell-padding:${label}`) };
}
