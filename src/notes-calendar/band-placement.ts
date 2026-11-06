import { weekendRuns } from "@/calendar";

export interface BandRow {
  readonly isCurrentWeek: boolean;
  /** Whether any of the row's rendered days is a real day rather than a blank; a hidden weekday is not rendered. */
  readonly hasDay: boolean;
}

export interface BandPlacement {
  readonly weekend: readonly { readonly key: string; readonly column: string }[];
  /** The index among `rows` of the row the current-week band crosses, or -1. */
  readonly currentWeekIndex: number;
  readonly currentWeekRow: string | undefined;
}

/**
 * Where a month or week grid draws its bands, by grid line. Left week numbers take the first column, and a
 * shown weekday header the first row; a visually hidden header is absolutely positioned, so it takes no row.
 */
export function bandPlacement(input: {
  /** The weekday of each visible day column, 0 = Sunday. */
  readonly columns: readonly number[];
  readonly weekend: ReadonlySet<number>;
  readonly weekNumbersLeft: boolean;
  readonly weekdayHeader: boolean;
  readonly rows: readonly BandRow[];
}): BandPlacement {
  const firstDayColumn = input.weekNumbersLeft ? 2 : 1;
  const weekend = weekendRuns(input.columns, input.weekend).map(({ start, span }) => ({
    key: String(start),
    column: `${start + firstDayColumn} / span ${span}`,
  }));
  // A row of blanks shows no day of the week to mark, so it takes no band even when today falls in it.
  const currentWeekIndex = input.rows.findIndex((row) => row.isCurrentWeek && row.hasDay);
  const currentWeekRow =
    currentWeekIndex === -1 ? undefined : `${currentWeekIndex + (input.weekdayHeader ? 2 : 1)} / span 1`;
  return { weekend, currentWeekIndex, currentWeekRow };
}
