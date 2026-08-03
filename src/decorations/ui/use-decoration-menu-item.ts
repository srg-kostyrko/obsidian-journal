import type { Period } from "@/calendar";
import { m } from "@/i18n";
import type { MenuItemSpec } from "@/infrastructure/host";
import { useModalService } from "@/infrastructure/host/modals";
import { icons } from "@/ui/icons";

import { cellKey } from "../engine";

import { decorationBreakdownModal } from "./modals";

import type { CellStyleRef } from "./cell-decoration-map-key";

// Contributing nothing for an undecorated cell is what keeps a plain empty cell menu-less:
// the host only builds a menu when there are paths or contributed items.
export function useDecorationMenuItems(
  cells: ReadonlyMap<string, CellStyleRef> | null,
): (period: Period) => readonly MenuItemSpec[] {
  const modals = useModalService();

  return (period: Period): readonly MenuItemSpec[] => {
    const styles = cells?.get(cellKey(period.kind, period.anchor.toAnchor()))?.value ?? [];
    if (styles.length === 0) return [];
    return [
      {
        title: m.decoration_explain_menu_item(),
        icon: icons.action.search,
        onClick: () => {
          void modals.open(decorationBreakdownModal, { period });
        },
      },
    ];
  };
}
