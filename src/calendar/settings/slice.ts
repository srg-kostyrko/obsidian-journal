import * as v from "valibot";

import { defineSlice } from "@/settings";

const localeMode = v.object({ mode: v.literal("locale") });

const customMode = v.pipe(
  v.object({
    mode: v.literal("custom"),
    dow: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
    doy: v.pipe(v.number(), v.integer()),
    global: v.boolean(),
  }),
  v.check((state) => {
    const firstDayInJan = 7 + state.dow - state.doy;
    return firstDayInJan >= 1 && firstDayInJan <= 7;
  }, "doy must satisfy 1 ≤ 7 + dow - doy ≤ 7"),
);

export const calendarSliceSchema = v.variant("mode", [localeMode, customMode]);

export type CalendarSliceState = v.InferOutput<typeof calendarSliceSchema>;

export const calendarSlice = defineSlice<"calendar", typeof calendarSliceSchema>("calendar", calendarSliceSchema, {
  mode: "locale",
});
