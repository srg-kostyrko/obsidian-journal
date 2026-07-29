import * as v from "valibot";

export const calendarBlockBaseSchema = {
  before: v.pipe(v.number(), v.integer(), v.minValue(0)),
  after: v.pipe(v.number(), v.integer(), v.minValue(0)),
  hiddenWeekdays: v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))), []),
  weeks: v.optional(v.picklist(["default", "none", "left", "right"]), "default"),
};
