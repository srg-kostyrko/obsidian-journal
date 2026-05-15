import { assert, vi } from "vitest";

import type { Option } from "@/infrastructure/result";
import type { CollectionDefinition, SettingsService } from "@/settings";

import { journalConfigCollection, journalDefaultsFor } from "./config";

import type { JournalConfig, JournalWrite } from "./config";

export function unwrap<T>(opt: Option<T>): T {
  assert(opt.isSome(), "expected Some");
  return opt.value;
}

export function fakeSettings(journals: Record<string, JournalConfig>): SettingsService {
  return {
    getCollection: vi.fn((collection: CollectionDefinition<string, never>) => {
      if (collection === journalConfigCollection) {
        return {
          entries: journals,
          add: vi.fn(),
          remove: vi.fn(),
          get: (id: string) => journals[id],
        };
      }
      throw new Error(`unexpected collection: ${collection.key}`);
    }),
  } as unknown as SettingsService;
}

export function fixedJournal(name: string, write: JournalWrite, overrides: Partial<JournalConfig> = {}): JournalConfig {
  return { ...journalDefaultsFor(write, name), ...overrides };
}

type CustomEvery = "day" | "week" | "month" | "quarter" | "year";

export function customJournal(
  name: string,
  every: CustomEvery,
  duration: number,
  anchorDate: string,
  overrides: Partial<JournalConfig> = {},
): JournalConfig {
  const base = journalDefaultsFor({ type: "custom", every, duration, anchorDate: anchorDate as never }, name);
  return { ...base, ...overrides };
}
