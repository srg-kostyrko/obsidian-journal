import { createNanoEvents } from "nanoevents";

import { ShelvesRepository } from "./repository";

import type { ShelfConfig } from "./config";

export function fakeShelvesRepo(shelves: Record<string, ShelfConfig> = {}): ShelvesRepository {
  return ShelvesRepository.fromParts(shelves, createNanoEvents());
}
