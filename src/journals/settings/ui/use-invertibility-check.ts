import { computed, type ComputedRef, type Ref } from "vue";

import { CalendarDate, weekOfMonth } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { TemplateContext, TemplateEngine, tokenize, variableNames } from "@/templates";

import { CycleService } from "../../cycle";
import { NotePathService } from "../../notes/note-path";
import { parseSpecFor } from "../../prompts/prompt-binding";
import { promptsInPath } from "../../prompts/prompts-in-path";

import type { JournalConfig } from "../../config";

export type InvertibilityWarning =
  | { kind: "non-invertible"; reason: "function-token" | "unknown-variable" | "clock-variable"; offending: string }
  | { kind: "coarse-date" }
  | { kind: "cyclic-top" }
  | { kind: "no-carry"; offending: string }
  | { kind: "unused-digits"; missing: readonly string[] }
  | { kind: "text-prompt-in-path"; offending: string };

const DATE_VARIABLES = new Set(["date", "start_date", "end_date"]);

export function useInvertibilityCheck(
  config: Ref<JournalConfig | undefined>,
): ComputedRef<InvertibilityWarning | null> {
  const engine = useService(TemplateEngine);
  const cycle = useService(CycleService);
  const paths = useService(NotePathService);

  // Whether a note this journal writes for `anchor` names the period it was written for.
  // Nothing shorter answers that: a date variable identifies the period only when its format
  // is finer than the cycle, and the numbering only when the odometer inverts.
  const roundTripsAt = (name: string, anchor: AnchorString): boolean => {
    const path = paths.pathForDate(name, CalendarDate.fromAnchor(anchor));
    return (
      path.isOk() &&
      paths
        .candidateFor(name, path.value)
        .filter((meta) => meta.anchor === anchor)
        .isSome()
    );
  };

  return computed(() => {
    const value = config.value;
    if (!value?.nameTemplate) return null;
    const numbering = value.numbering;
    const today = CalendarDate.today();
    let context = TemplateContext.empty()
      .string("journal_name", "preview")
      .date("date", today, "YYYY-MM-DD")
      .date("start_date", today, "YYYY-MM-DD")
      .date("end_date", today, "YYYY-MM-DD")
      .derived("week_of_month", today, weekOfMonth);
    for (const source of numbering.sources) {
      context = context.number(source.variable, 0);
    }
    for (const prompt of value.prompts) {
      context = context.withSpec(prompt.variable, parseSpecFor(prompt, value.dateFormat));
    }
    // A failure to match the sample path is expected; only a compile-time not-invertible
    // error means the template can't be reverse-parsed at all.
    const parsed = engine.parse(tokenize(value.nameTemplate), "preview", context);
    if (parsed.isErr()) {
      const detail = parsed.error.detail;
      if (detail.kind === "not-invertible") {
        return { kind: "non-invertible", reason: detail.reason, offending: detail.offending };
      }
    }
    // A text answer has no bounded pattern, so a name or folder carrying one matches only while
    // it is unanswered. Every real note of this journal is then invisible to path inversion —
    // worth its own verdict rather than passing silently as a template that "compiles".
    const textInPath = promptsInPath(value).find((prompt) => prompt.type === "text");
    if (textInPath) return { kind: "text-prompt-in-path", offending: textInPath.variable };
    // The template compiles, but auto-attach still needs to recover an anchor from the path.
    // Two adjacent periods, because a coarse date variable pins one period of its own range —
    // a year on a two-week cycle names every note of the year alike, yet the interval holding
    // January 1st still round-trips.
    const start = cycle.anchorOf(value.name, probeDate(value));
    const next = start.flatMap((anchor) => cycle.nextAnchor(value.name, anchor));
    if (
      start.isSome() &&
      next.isSome() &&
      roundTripsAt(value.name, start.value) &&
      roundTripsAt(value.name, next.value)
    )
      return null;
    const pathVariables = new Set([...variableNames(value.nameTemplate), ...variableNames(value.folder)]);
    // A template with no date at all is answered by the numbering verdicts alone — a name that
    // never names a date is not the same defect as one whose date names too many periods.
    const dated = [...pathVariables].some((name) => DATE_VARIABLES.has(name.toLowerCase()));
    // A disabled sequence renders its digits as empty strings, which is a separate defect;
    // none of the numbering verdicts below describes it.
    if (!numbering.enabled) return dated ? { kind: "coarse-date" } : null;
    if (numbering.sources.every((source) => !pathVariables.has(source.variable)))
      return dated ? { kind: "coarse-date" } : null;
    // A wrapping most significant digit repeats, so no template arrangement recovers a date.
    if (numbering.sources.at(0)?.reset.kind === "after") return { kind: "cyclic-top" };
    // A `never` digit below the top emits no carry, so every digit above it stays frozen.
    const noCarry = numbering.sources.slice(1).find((source) => source.reset.kind === "never");
    if (noCarry) return { kind: "no-carry", offending: noCarry.variable };
    const missing = numbering.sources
      .filter((source) => !pathVariables.has(source.variable))
      .map((source) => source.variable);
    return missing.length > 0 ? { kind: "unused-digits", missing } : null;
  });
}

// Numbering does not resolve before its anchor date, so a journal that starts in the future
// has no numbers to name today's period with — probe from its own start instead.
function probeDate(config: JournalConfig): CalendarDate {
  const today = CalendarDate.today();
  const start = config.timeline.start || config.numbering.anchorDate;
  return start > today.toAnchor() ? CalendarDate.fromAnchor(start) : today;
}
