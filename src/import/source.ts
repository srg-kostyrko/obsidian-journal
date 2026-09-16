import { createMultiToken } from "@/infrastructure/di";

export type SourceId = "periodic-notes" | "daily-notes" | "calendar";
export type PeriodKind = "day" | "week" | "month" | "quarter" | "year";

export const PERIOD_KINDS: readonly PeriodKind[] = ["day", "week", "month", "quarter", "year"];

// What Periodic Notes, Calendar and core Daily notes write when a format is left empty. Filling in
// Journals' own defaults instead would name none of the notes the user already has.
export const SOURCE_DEFAULT_FORMATS: Readonly<Record<PeriodKind, string>> = {
  day: "YYYY-MM-DD",
  week: "gggg-[W]ww",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
};

export interface SourceJournal {
  readonly source: SourceId;
  readonly set?: string;
  readonly period: PeriodKind;
  readonly folder: string;
  readonly format: string;
  readonly templates: readonly string[];
  readonly openAtStartup: boolean;
}

export type SourceWeekStart = { readonly kind: "locale" } | { readonly kind: "day"; readonly dow: number };

export interface SourceReading {
  readonly source: SourceId;
  readonly variant?: "0.x" | "1.x";
  // Whether the user set anything up in this source. Only a configured source may raise the
  // dashboard notice: core Daily notes is on by default in every vault.
  readonly configured: boolean;
  readonly journals: readonly SourceJournal[];
  readonly weekStart?: SourceWeekStart;
}

export type SourceRead =
  | { readonly kind: "absent" }
  | { readonly kind: "read"; readonly reading: SourceReading }
  | { readonly kind: "unrecognised"; readonly source: SourceId };

export interface ImportSource {
  readonly id: SourceId;
  read(): SourceRead;
}

export const ImportSourceToken = createMultiToken<ImportSource>("import.source");

export function normalizeFolder(folder: string): string {
  return folder.trim().replaceAll(/^\/+|\/+$/g, "");
}

export function templatesOf(path: string): string[] {
  const trimmed = path.trim();
  return trimmed === "" ? [] : [trimmed];
}
