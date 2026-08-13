import { localeData } from "@/calendar";
import { m } from "@/i18n";

interface CalendarLikeConfig {
  readonly before: number;
  readonly after: number;
  readonly hiddenWeekdays?: readonly number[];
}

export function calendarBlockSummary(config: CalendarLikeConfig): string | undefined {
  const parts: string[] = [];
  const padding: string[] = [];
  if (config.before > 0) {
    padding.push(m.view_block_summary_before({ count: config.before }));
  }
  if (config.after > 0) {
    padding.push(m.view_block_summary_after({ count: config.after }));
  }
  if (padding.length > 0) {
    parts.push(padding.join(", "));
  }
  if (config.hiddenWeekdays && config.hiddenWeekdays.length > 0) {
    const names = localeData().weekdaysShort();
    parts.push(m.view_block_summary_hidden_days({ days: config.hiddenWeekdays.map((day) => names[day]).join(", ") }));
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
