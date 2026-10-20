import * as v from "valibot";

import { climb } from "@/settings/repair";

export const calendarBlockBaseSchema = {
  before: v.pipe(v.number(), v.integer(), v.minValue(0)),
  after: v.pipe(v.number(), v.integer(), v.minValue(0)),
  hiddenWeekdays: v.pipe(
    v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))), []),
    climb("an empty list shows every weekday"),
  ),
  weeks: v.optional(v.picklist(["default", "none", "left", "right"]), "default"),
};
