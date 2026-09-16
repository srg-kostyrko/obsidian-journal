import { match } from "ts-pattern";

import { m } from "@/i18n";

import type { SourceId } from "../source";

export function sourceName(source: SourceId): string {
  return match(source)
    .with("periodic-notes", () => m.import_source_periodic_notes())
    .with("calendar", () => m.import_source_calendar())
    .with("daily-notes", () => m.import_source_daily_notes())
    .exhaustive();
}
