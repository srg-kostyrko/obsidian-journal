import { shelvesCollection } from "./config";

import type { ShelfConfig } from "./config";

export function buildShelf(name: string, overrides: Partial<ShelfConfig> = {}): ShelfConfig {
  return { ...shelvesCollection.defaultItem(name), ...overrides };
}
