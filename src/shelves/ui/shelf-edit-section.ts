import { createMultiToken } from "@/infrastructure/di";

import type { Component } from "vue";

export interface ShelfEditSection {
  readonly key: string;
  readonly component: Component;
  readonly order: number;
}

export function defineShelfEditSection(section: ShelfEditSection): ShelfEditSection {
  return section;
}

export const ShelfEditSectionToken = createMultiToken<ShelfEditSection>("shelves.editSection");
