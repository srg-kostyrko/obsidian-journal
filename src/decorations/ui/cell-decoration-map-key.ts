import type { AnchorString } from "@/calendar";

import type { JournalDecorationStyle } from "../config";
import type { InjectionKey, ShallowRef } from "vue";

export type CellStyleRef = ShallowRef<readonly JournalDecorationStyle[]>;

export const CellDecorationMapKey: InjectionKey<ReadonlyMap<AnchorString, CellStyleRef>> =
  Symbol("decorations:cell-map");
