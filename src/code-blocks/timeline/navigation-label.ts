import type { Period } from "@/calendar";
import { m } from "@/i18n";
import { accessibleFormatPattern, defaultFormatPattern } from "@/notes-calendar/cell-format";

// A week belongs to its week-year, which is not the year its start date falls in: the week
// holding 1 January 2027 can start in December 2026 and `YYYY` would name the wrong year.
function yearOf(period: Period): string {
  return period.format(period.kind === "week" ? "gggg" : "YYYY");
}

// Names the periods the block is showing. The grids beneath carry each period's own heading,
// so this is a heading for the set rather than the only place a date appears — but it is the
// only thing that answers "where am I" once the reset control is the only way back.
export function navigationLabel(periods: readonly Period[]): string {
  const first = periods.at(0);
  const last = periods.at(-1);
  if (!first || !last) return "";

  const full = last.format(accessibleFormatPattern(last.kind));
  // Compared through kind and anchor rather than isSame: the two ends are `Period`, and the
  // union's isSame takes its own member type, so calling it would need a cast to line up.
  if (first.kind === last.kind && first.anchor.toAnchor() === last.anchor.toAnchor()) return full;

  // The shared year reads once, at the end, where it covers both ends of the range. Two
  // different years have to be printed twice or the first end names no year at all.
  const from =
    yearOf(first) === yearOf(last)
      ? first.format(defaultFormatPattern(first.kind))
      : first.format(accessibleFormatPattern(first.kind));
  return m.code_blocks_timeline_navigation_range({ from, to: full });
}
