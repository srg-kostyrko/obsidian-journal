import { createNanoEvents } from "nanoevents";
import { assert } from "vitest";

import type { Option } from "@/infrastructure/result";

import { journalDefaultsFor } from "./config";
import { JournalsRepository } from "./repository";

import type { JournalConfig, JournalWrite } from "./config";

export function unwrap<T>(opt: Option<T>): T {
  assert(opt.isSome(), "expected Some");
  return opt.value;
}

export function fakeRepo(journals: Record<string, JournalConfig>): JournalsRepository {
  return JournalsRepository.fromParts(journals, createNanoEvents());
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
