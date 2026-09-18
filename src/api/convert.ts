import { match } from "ts-pattern";

import { parseDateExpression } from "@/calendar";
import type { CalendarDate } from "@/calendar";
import { Option } from "@/infrastructure/result";
import type { JournalConfig } from "@/journals/config";
import { isLongText, isRequired } from "@/journals/prompts/config";
import { promptsInPath, type PromptOwner } from "@/journals/prompts/prompts-in-path";

import type {
  DateInput,
  JournalInfo,
  JournalSelector,
  JournalWrite,
  JournalWriteType,
  NoteletTypeInfo,
  PromptInfo,
} from "./public-api";

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

function toPromptInfos(owner: PromptOwner): readonly PromptInfo[] {
  const inPath = new Set(promptsInPath(owner).map((prompt) => prompt.variable));
  return owner.prompts.map((prompt) => ({
    variable: prompt.variable,
    question: prompt.question,
    type: prompt.type,
    required: isRequired(prompt),
    inPath: inPath.has(prompt.variable),
    multiline: isLongText(prompt),
    options: prompt.type === "select" ? prompt.options.map(({ label, value }) => ({ label, value })) : [],
  }));
}

export function toJournalInfo(name: string, config: JournalConfig, shelf: string): JournalInfo {
  const write: JournalWrite = match(config.write)
    .with({ type: "custom" }, ({ every, duration }) => ({ type: "custom" as const, every, duration }))
    .otherwise(({ type }) => ({ type }));
  // Sorted rather than record order: the keys are nanoids, so record order is creation order and
  // an unrelated edit would reshuffle a caller's list.
  const types = Object.values(config.notelets).toSorted((a, b) => a.name.localeCompare(b.name));
  const noteletTypes: readonly NoteletTypeInfo[] = types.map((type) => ({
    name: type.name,
    prompts: toPromptInfos(type),
  }));
  return {
    name,
    shelf: shelf === "" ? null : shelf,
    write,
    notelets: types.map((type) => type.name),
    prompts: toPromptInfos(config),
    noteletTypes,
  };
}
