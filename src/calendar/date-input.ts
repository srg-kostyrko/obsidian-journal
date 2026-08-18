import { Option } from "@/infrastructure/result";

import { CalendarDate } from "./calendar-date";

const RELATIVE_DATE = /^([+-])(\d+)([dwmqy])$/;

/** "today" / "" / "+1w" / "-3d" / "YYYY-MM-DD". None when the expression is none of those. */
export function parseDateExpression(raw: string): Option<CalendarDate> {
  const value = raw.trim();
  if (!value || value === "today") return Option.some(CalendarDate.today());

  const relative = RELATIVE_DATE.exec(value);
  if (relative) {
    const sign = relative[1] === "-" ? -1 : 1;
    const amount = sign * Number(relative[2]);
    const unit = relative[3] as "d" | "w" | "m" | "q" | "y";
    return Option.some(CalendarDate.today().shift(amount, unit));
  }

  const parsed = CalendarDate.parse(value);
  return parsed.isErr() ? Option.none() : Option.some(parsed.value);
}
