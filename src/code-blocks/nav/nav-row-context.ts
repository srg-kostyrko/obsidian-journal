import { match } from "ts-pattern";

import { CalendarDate, relativeDate, type AnchorString, type PeriodKind } from "@/calendar";
import { m } from "@/i18n";
import { Option } from "@/infrastructure/result";
import type { CycleService, JournalConfig, JournalEntry, NumberingService, JournalWrite } from "@/journals";
import { TemplateContext } from "@/templates";

export interface NavRowContextInputs {
  readonly journal: JournalConfig;
  readonly refDate: AnchorString;
  readonly entry: Option<JournalEntry>;
  readonly cycle: CycleService;
  readonly numbering: NumberingService;
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

// Custom intervals have no fixed period unit, so relative_date names the interval by the
// journal itself ("This/Last/Next <journal>", "N <journal> ago") — v2 parity, minus v2's
// English plural since a user's journal name can't be inflected. Steps are counted from the
// interval containing today to the row's interval.
function customRelativeDate(name: string, cycle: CycleService, refDate: AnchorString, today: AnchorString): string {
  const stepsOpt = cycle
    .anchorOf(name, CalendarDate.fromAnchor(today))
    .flatMap((currentAnchor) => cycle.countRepeats(name, currentAnchor, refDate));
  if (stepsOpt.isNone()) return "";
  const steps = stepsOpt.value;
  if (steps === 0) return m.relative_date_custom_this({ name });
  if (steps === -1) return m.relative_date_custom_last({ name });
  if (steps === 1) return m.relative_date_custom_next({ name });
  if (steps < 0) return m.relative_date_custom_ago({ name, count: -steps });
  return m.relative_date_custom_from_now({ name, count: steps });
}

export function buildNavRowContext(inputs: NavRowContextInputs): TemplateContext {
  const { journal, refDate, entry, cycle, numbering, today } = inputs;
  const refCalendarDate = CalendarDate.fromAnchor(refDate);
  const startDate = cycle.startOf(journal.name, refDate).getOr(refCalendarDate);
  const endDate = cycle.endOf(journal.name, refDate).getOr(refCalendarDate);
  const periodKind = fixedPeriodKindFor(journal.write);
  const relative =
    periodKind === null
      ? customRelativeDate(journal.name, cycle, refDate, today)
      : relativeDate(periodKind, refDate, today);

  let context = TemplateContext.empty()
    .date("date", refCalendarDate, journal.dateFormat)
    .date("start_date", startDate, journal.dateFormat)
    .date("end_date", endDate, journal.dateFormat)
    .string("relative_date", relative)
    .string("journal_name", journal.name);

  // A note's stored numbers are authoritative (manual extension/renumber); fall back to the
  // computed numbering so the row resolves the index even before the note exists.
  const numbers =
    entry.isSome() && entry.value.numbers
      ? Option.some(entry.value.numbers)
      : numbering.assignNumbers(journal.name, refDate);
  if (numbers.isSome()) {
    for (const [variable, value] of Object.entries(numbers.value)) {
      if (typeof value === "number") context = context.number(variable, value);
    }
  }
  return context;
}
