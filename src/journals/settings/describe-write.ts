import { match } from "ts-pattern";

import type { JournalWrite } from "@/journals";

export type WriteDescriptor =
  | { type: "day" | "week" | "month" | "quarter" | "year" }
  | { type: "custom"; every: "day" | "week" | "month" | "quarter" | "year"; duration: number };

export function describeWrite(write: JournalWrite): WriteDescriptor {
  return match(write)
    .with({ type: "custom" }, ({ every, duration }) => ({ type: "custom" as const, every, duration }))
    .otherwise(({ type }) => ({ type }));
}
