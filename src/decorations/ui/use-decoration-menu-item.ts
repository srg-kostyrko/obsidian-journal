import { toValue, type MaybeRefOrGetter } from "vue";

import { m } from "@/i18n";
import type { MenuItemSpec } from "@/infrastructure/host";
import { useModalService } from "@/infrastructure/host/modals";
import { icons } from "@/ui/icons";

import { cellKey } from "../engine";

import { decorationCellModal } from "./modals";

import type { BreakdownEntry } from "./breakdown-entry";
import type { CellStyleRef } from "./cell-decoration-map-key";

// Contributing nothing for an undecorated cell is what keeps a plain empty cell menu-less:
// the host only builds a menu when there are paths or contributed items.
export function useDecorationMenuItems(
  cells: ReadonlyMap<string, CellStyleRef> | null,
  // A shelf narrows which decorations painted the cell, so the breakdown resolves against the
  // surface's shelf rather than all journals — otherwise it can name a winner the cell does
  // not render, or cite a journal that shelf excludes.
  shelf: MaybeRefOrGetter<string | null>,
): (entry: BreakdownEntry) => readonly MenuItemSpec[] {
  // A surface with no decoration map can never have a decorated cell to explain, so it
  // should not have to provide ModalService just to mount this composable.
  if (cells === null) return () => [];

  const modals = useModalService();

  return (entry: BreakdownEntry): readonly MenuItemSpec[] => {
    const { period } = entry;
    const styles = cells.get(cellKey(period.kind, period.anchor.toAnchor()))?.value ?? [];
    if (styles.length === 0) return [];
    return [
      {
        title: m.decoration_explain_menu_item(),
        icon: icons.action.search,
        onClick: () => {
          void modals.open(decorationCellModal, { entry, shelf: toValue(shelf) });
        },
      },
    ];
  };
}
