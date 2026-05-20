import { computed, type ComputedRef, type Ref } from "vue";

import { CalendarDate } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { TemplateContext, TemplateEngine, tokenize } from "@/templates";

export interface InvertibilityWarning {
  reason: "function-token" | "unknown-variable" | "clock-variable";
  offending: string;
}

export function useInvertibilityCheck(template: Ref<string>): ComputedRef<InvertibilityWarning | null> {
  const engine = useService(TemplateEngine);
  return computed(() => {
    const value = template.value;
    if (!value) return null;
    const today = CalendarDate.today();
    const context = TemplateContext.empty()
      .string("journal_name", "preview")
      .date("date", today, "YYYY-MM-DD")
      .date("start_date", today, "YYYY-MM-DD")
      .date("end_date", today, "YYYY-MM-DD");
    const stream = tokenize(value);
    const parsed = engine.parse(stream, "preview", context);
    if (parsed.isOk()) return null;
    const detail = parsed.error.detail;
    if (detail.kind === "not-invertible") {
      return { reason: detail.reason, offending: detail.offending };
    }
    return null;
  });
}
