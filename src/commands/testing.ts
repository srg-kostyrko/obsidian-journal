import { commandCollection } from "./config";

import type { CommandConfig } from "./config";

export function buildCommand(overrides: Partial<CommandConfig> = {}): CommandConfig {
  return { ...commandCollection.defaultItem(""), ...overrides };
}
