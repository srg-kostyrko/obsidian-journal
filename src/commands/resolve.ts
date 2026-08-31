import { match } from "ts-pattern";

import type { JournalWrite } from "@/journals";

import type { CommandTarget, CommandType } from "./config";

export interface CompoundShift {
  readonly amount: number;
  readonly unit: "w" | "m" | "y";
}

export function supportedTypes(writeType: JournalWrite["type"]): CommandType[] {
  return match<JournalWrite["type"], CommandType[]>(writeType)
    .with("day", () => [
      "same",
      "next",
      "previous",
      "previous_available",
      "next_available",
      "same_next_week",
      "same_previous_week",
      "same_next_month",
      "same_previous_month",
      "same_next_year",
      "same_previous_year",
    ])
    .with("month", "quarter", () => [
      "same",
      "next",
      "previous",
      "previous_available",
      "next_available",
      "same_next_year",
      "same_previous_year",
    ])
    .with("week", "year", "custom", () => ["same", "next", "previous", "previous_available", "next_available"])
    .exhaustive();
}

export function isAvailableType(type: CommandType): boolean {
  return type === "previous_available" || type === "next_available";
}

/** The types a command may take, narrowed by what its target can actually do. */
export function supportedTypesFor(target: CommandTarget, writeType: JournalWrite["type"]): readonly CommandType[] {
  const types = supportedTypes(writeType);
  // A notelet command always creates, so the two types that resolve to "the nearest period that
  // already has a note" would mean "find an existing notelet and create a second one beside it".
  return target.kind === "notelet" ? types.filter((type) => !isAvailableType(type)) : types;
}

export function compoundShift(type: CommandType): CompoundShift | null {
  return match<CommandType, CompoundShift | null>(type)
    .with("same_next_week", () => ({ amount: 1, unit: "w" }))
    .with("same_previous_week", () => ({ amount: -1, unit: "w" }))
    .with("same_next_month", () => ({ amount: 1, unit: "m" }))
    .with("same_previous_month", () => ({ amount: -1, unit: "m" }))
    .with("same_next_year", () => ({ amount: 1, unit: "y" }))
    .with("same_previous_year", () => ({ amount: -1, unit: "y" }))
    .otherwise(() => null);
}
