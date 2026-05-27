import { match } from "ts-pattern";

import { CalendarDate, relativeDate, type AnchorString, type PeriodKind } from "@/calendar";
import type { Option } from "@/infrastructure/result";
import type { CycleService, JournalConfig, JournalEntry, JournalWrite } from "@/journals";
import { TemplateContext } from "@/templates";

export interface NavRowContextInputs {
  readonly journal: JournalConfig;
  readonly refDate: AnchorString;
  readonly entry: Option<JournalEntry>;
  readonly cycle: CycleService;
  readonly today: AnchorString;
}

function fixedPeriodKindFor(write: JournalWrite): Exclude<PeriodKind, "decade"> | null {
  return match(write)
    .with({ type: "day" }, () => "day" as const)
    .with({ type: "week" }, () => "week" as const)
    .with({ type: "month" }, () => "month" as const)
    .with({ type: "quarter" }, () => "quarter" as const)
    .with({ type: "year" }, () => "year" as const)
    .with({ type: "custom" }, () => null)
    .exhaustive();
}

export function buildNavRowContext(inputs: NavRowContextInputs): TemplateContext {
  const { journal, refDate, entry, cycle, today } = inputs;
  const refCalendarDate = CalendarDate.fromAnchor(refDate);
  const startDate = cycle.startOf(journal.name, refDate).getOr(refCalendarDate);
  const endDate = cycle.endOf(journal.name, refDate).getOr(refCalendarDate);
  const periodKind = fixedPeriodKindFor(journal.write);
  const relative = periodKind === null ? "" : relativeDate(periodKind, refDate, today);

  let context = TemplateContext.empty()
    .date("date", refCalendarDate, journal.dateFormat)
    .date("start_date", startDate, journal.dateFormat)
    .date("end_date", endDate, journal.dateFormat)
    .string("relative_date", relative)
    .string("journal_name", journal.name);

  if (entry.isSome()) {
    const indexValue = entry.value.numbers?.index;
    if (typeof indexValue === "number") context = context.number("index", indexValue);
  }
  return context;
}
