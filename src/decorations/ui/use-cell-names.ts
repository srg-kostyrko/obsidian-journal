import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type { Period } from "@/calendar";

import { cellKey } from "../engine";

import { CellDecorationMapKey, type CellDecorationMap, type CellDecorationScope } from "./cell-decoration-map-key";

/** The names of the decorations painting `period` in `cells`. */
export function cellNamesIn(cells: CellDecorationMap | null, period: Period): readonly string[] {
  return cells?.get(cellKey(period.kind, period.anchor.toAnchor()))?.value.names ?? [];
}

/** The names of the decorations painting `period` in the surrounding decorated grid. */
export function useCellNames(
  period: MaybeRefOrGetter<Period>,
  scope?: CellDecorationScope,
): ComputedRef<readonly string[]> {
  const cells = inject(scope?.map ?? CellDecorationMapKey, null);
  return computed(() => cellNamesIn(cells, toValue(period)));
}
