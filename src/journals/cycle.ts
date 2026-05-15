import { match } from "ts-pattern";

import type { AnchorString, PeriodKind } from "@/calendar";

import type { JournalWrite } from "./config";

export type JournalCycle =
  | { readonly kind: "fixed"; readonly period: PeriodKind }
  | {
      readonly kind: "custom";
      readonly every: PeriodKind;
      readonly duration: number;
      readonly anchor: AnchorString;
    };

export function buildCycle(write: JournalWrite): JournalCycle {
  return match(write)
    .with({ type: "custom" }, (w) => ({
      kind: "custom" as const,
      every: w.every,
      duration: w.duration,
      anchor: w.anchorDate,
    }))
    .otherwise((w) => ({ kind: "fixed" as const, period: w.type }));
}
