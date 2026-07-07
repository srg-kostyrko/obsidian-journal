import { moment } from "obsidian";

import { m } from "@/i18n";

interface CalendarLikeConfig {
  readonly before: number;
  readonly after: number;
  readonly hiddenWeekdays?: readonly number[];
}

export function calendarBlockSummary(config: CalendarLikeConfig): string | undefined {
  const parts: string[] = [];
  if (config.before > 0 || config.after > 0) {
    parts.push(m.view_block_summary_padding({ before: config.before, after: config.after }));
  }
  if (config.hiddenWeekdays && config.hiddenWeekdays.length > 0) {
    const names = moment.localeData().weekdaysShort();
    parts.push(m.view_block_summary_hidden_days({ days: config.hiddenWeekdays.map((day) => names[day]).join(", ") }));
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
