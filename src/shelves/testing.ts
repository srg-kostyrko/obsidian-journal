import { createNanoEvents } from "nanoevents";

import { shelvesCollection } from "./config";
import { ShelvesRepository } from "./repository";

import type { ShelfConfig } from "./config";

export function buildShelf(name: string, overrides: Partial<ShelfConfig> = {}): ShelfConfig {
  return { ...shelvesCollection.defaultItem(name), ...overrides };
}

export function fakeShelvesRepo(shelves: Record<string, ShelfConfig> = {}): ShelvesRepository {
  return ShelvesRepository.fromParts(shelves, createNanoEvents());
}
