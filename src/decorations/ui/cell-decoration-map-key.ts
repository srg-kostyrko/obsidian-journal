import type { AnchorString } from "@/calendar";

import type { JournalDecorationStyle } from "../config";
import type { InjectionKey, Ref, ShallowRef } from "vue";

export type CellStyleRef = ShallowRef<readonly JournalDecorationStyle[]>;

export const CellDecorationMapKey: InjectionKey<ReadonlyMap<AnchorString, CellStyleRef>> =
  Symbol("decorations:cell-map");

// One padding reservation shared by every cell in a decorated grid, so a decoration on a
// single cell never inflates only its own row. Provided by useCellDecorations.
export const CellPaddingKey: InjectionKey<Ref<string>> = Symbol("decorations:cell-padding");
