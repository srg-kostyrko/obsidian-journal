import { computed, type ComputedRef, type Ref } from "vue";

import { CalendarDate } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { TemplateContext, TemplateEngine, tokenize } from "@/templates";

import { invertibleNumberingVariable } from "../../numbering";

import type { JournalConfig } from "../../config";

export type InvertibilityWarning =
  | { kind: "non-invertible"; reason: "function-token" | "unknown-variable" | "clock-variable"; offending: string }
  | { kind: "no-anchor" };

function variableNames(template: string): Set<string> {
  const names = new Set<string>();
  for (const token of tokenize(template)) {
    if (token.kind === "variable") names.add(token.name);
  }
  return names;
}

export function useInvertibilityCheck(
  config: Ref<JournalConfig | undefined>,
): ComputedRef<InvertibilityWarning | null> {
  const engine = useService(TemplateEngine);
  return computed(() => {
    const value = config.value;
    if (!value?.nameTemplate) return null;
    const numbering = value.numbering;
    const today = CalendarDate.today();
    let context = TemplateContext.empty()
      .string("journal_name", "preview")
      .date("date", today, "YYYY-MM-DD")
      .date("start_date", today, "YYYY-MM-DD")
      .date("end_date", today, "YYYY-MM-DD");
    for (const source of numbering.sources) {
      context = context.number(source.variable, 0);
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
    // The template compiles, but auto-attach still needs to recover an anchor. The date
    // variable does that directly; otherwise it inverts a single non-cyclic numbering value
    // captured from either the name or folder template.
    const nameVariables = variableNames(value.nameTemplate);
    if (nameVariables.has("date")) return null;
    const invertibleVariable = invertibleNumberingVariable(numbering);
    const pathVariables = new Set([...nameVariables, ...variableNames(value.folder)]);
    if (invertibleVariable !== null && pathVariables.has(invertibleVariable)) return null;
    const usesNumberingVariable = numbering.sources.some((source) => pathVariables.has(source.variable));
    return usesNumberingVariable ? { kind: "no-anchor" } : null;
  });
}
