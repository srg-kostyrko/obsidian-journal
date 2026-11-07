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
  /** The week-number column from the first week row down, or undefined without week numbers. */
  readonly divider: { readonly column: string; readonly row: string } | undefined;
}

/** Where a month or week grid draws its bands, by grid line. */
export function bandPlacement(input: {
  /** The weekday of each visible day column, 0 = Sunday. */
  readonly columns: readonly number[];
  readonly weekend: ReadonlySet<number>;
  readonly weekNumbers: "left" | "right" | "none";
  readonly weekdayHeader: boolean;
  readonly rows: readonly BandRow[];
}): BandPlacement {
  const firstDayColumn = input.weekNumbers === "left" ? 2 : 1;
  const weekend = weekendRuns(input.columns, input.weekend).map(({ start, span }) => ({
    key: String(start),
    column: `${start + firstDayColumn} / span ${span}`,
  }));
  // A row of blanks shows no day of the week to mark, so it takes no band even when today falls in it.
  const currentWeekIndex = input.rows.findIndex((row) => row.isCurrentWeek && row.hasDay);
  // A visually hidden weekday header is absolutely positioned, so only a shown one takes the first row.
  const firstWeekRow = input.weekdayHeader ? 2 : 1;
  const currentWeekRow = currentWeekIndex === -1 ? undefined : `${currentWeekIndex + firstWeekRow} / span 1`;
  // Down to `auto`, the grid's end edge, so a month that grows a sixth row needs no new placement.
  const divider =
    input.weekNumbers === "none"
      ? undefined
      : { column: input.weekNumbers === "left" ? "1 / 2" : "-2 / -1", row: `${firstWeekRow} / auto` };
  return { weekend, currentWeekIndex, currentWeekRow, divider };
}
