import { match } from "ts-pattern";

import { parseDateExpression } from "@/calendar";
import type { CalendarDate } from "@/calendar";
import { Option } from "@/infrastructure/result";
import type { JournalConfig } from "@/journals/config";

import type { DateInput, JournalInfo, JournalSelector, JournalWrite, JournalWriteType } from "./public-api";

export interface NormalizedSelector {
  journal?: string;
  writeType?: JournalWriteType;
  shelf?: string | null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function hasToDate(input: DateInput): input is { toDate(): Date } {
  return typeof input === "object" && typeof (input as { toDate?: unknown }).toDate === "function";
}

export function toCalendarDate(input: DateInput): Option<CalendarDate> {
  if (typeof input === "string") return parseDateExpression(input);
  // A Date is a timestamp; the journal cares only about the local calendar day it names.
  const js = hasToDate(input) ? input.toDate() : input;
  if (Number.isNaN(js.getTime())) return Option.none();
  return parseDateExpression(`${js.getFullYear()}-${pad(js.getMonth() + 1)}-${pad(js.getDate())}`);
}

export function normalizeSelector(selector: JournalSelector | undefined): NormalizedSelector {
  if (selector === undefined) return {};
  if (typeof selector === "string") return { journal: selector };
  return { ...selector };
}

export function toJournalInfo(name: string, config: JournalConfig, shelf: string): JournalInfo {
  const write: JournalWrite = match(config.write)
    .with({ type: "custom" }, ({ every, duration }) => ({ type: "custom" as const, every, duration }))
    .otherwise(({ type }) => ({ type }));
  // Sorted rather than record order: the keys are nanoids, so record order is creation order and
  // an unrelated edit would reshuffle a caller's list.
  const notelets = Object.values(config.notelets)
    .map((type) => type.name)
    .toSorted((a, b) => a.localeCompare(b));
  return { name, shelf: shelf === "" ? null : shelf, write, notelets };
}
