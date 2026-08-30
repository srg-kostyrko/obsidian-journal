import * as v from "valibot";
import { assert } from "vitest";

import type { Option } from "@/infrastructure/result";

import { journalDefaultsFor, navBlockSegmentSchema } from "./config";
import { noteletTypeDefaults } from "./notelets/config";

import type { JournalConfig, JournalWrite, NavBlockSegment } from "./config";
import type { NoteletType } from "./notelets/config";

export function unwrap<T>(opt: Option<T>): T {
  assert(opt.isSome(), "expected Some");
  return opt.value;
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

const MINIMAL_SEGMENT = {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  addDecorations: false,
};

export function buildNavSegment(overrides: Partial<NavBlockSegment> = {}): NavBlockSegment {
  return { ...v.parse(navBlockSegmentSchema, MINIMAL_SEGMENT), ...overrides };
}

export function buildNoteletType(overrides: Partial<NoteletType> = {}): NoteletType {
  return { ...noteletTypeDefaults(overrides.id ?? "nt_test"), ...overrides };
}
