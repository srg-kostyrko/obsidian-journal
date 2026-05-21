import { match } from "ts-pattern";

import type { JournalWrite } from "@/journals";

import type { CommandType } from "./config";

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
      "same_next_week",
      "same_previous_week",
      "same_next_month",
      "same_previous_month",
      "same_next_year",
      "same_previous_year",
    ])
    .with("month", "quarter", () => ["same", "next", "previous", "same_next_year", "same_previous_year"])
    .with("week", "year", "custom", () => ["same", "next", "previous"])
    .exhaustive();
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
