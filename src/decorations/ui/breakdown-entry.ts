import type { Period } from "@/calendar";

// A Period does not identify a cell: a custom interval is a "day"-kind period at its start
// anchor, so it collides with the day cell beneath it. The surface that owns the cell is the
// only place that knows which of the two was clicked.
export type BreakdownEntry =
  | { readonly kind: "fixed"; readonly period: Period }
  | { readonly kind: "interval"; readonly period: Period; readonly journalName: string };
