import type { Period } from "@/calendar";

import type { CellAttribution } from "../attribute-cell";
import type { JournalDecorationStyle } from "../config";

export type BreakdownCell =
  | {
      readonly kind: "fixed";
      readonly period: Period;
      readonly attribution: CellAttribution;
      readonly styles: readonly JournalDecorationStyle[];
    }
  | {
      readonly kind: "interval";
      readonly period: Period;
      readonly journalName: string;
      readonly attribution: CellAttribution;
      readonly styles: readonly JournalDecorationStyle[];
    };
