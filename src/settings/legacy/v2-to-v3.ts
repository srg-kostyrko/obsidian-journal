import type { Migration } from "@/settings";

import { defaultCommands } from "./old-shapes";

export const v2ToV3Migration: Migration = {
  fromVersion: 2,
  toVersion: 3,
  migrate(raw) {
    raw.commands ??= structuredClone(defaultCommands);
    const shelves = (raw.shelves ?? {}) as Record<string, { commands?: unknown[] }>;
    for (const shelf of Object.values(shelves)) shelf.commands ??= [];
    raw.dismissedNotifications ??= [];
    return raw;
  },
};
