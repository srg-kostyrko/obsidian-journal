import * as v from "valibot";

import { colorSchema, type ColorSettings } from "@/decorations";
import { defineSlice } from "@/settings";

const todayColor: ColorSettings = { type: "theme", name: "text-accent" };
const todayBackground: ColorSettings = { type: "transparent" };
const activeColor: ColorSettings = { type: "theme", name: "text-on-accent" };
const activeBackground: ColorSettings = { type: "theme", name: "interactive-accent" };

export const appearanceSliceSchema = v.object({
  today: v.object({
    color: v.optional(colorSchema, () => ({ ...todayColor })),
    background: v.optional(colorSchema, () => ({ ...todayBackground })),
  }),
  active: v.object({
    color: v.optional(colorSchema, () => ({ ...activeColor })),
    background: v.optional(colorSchema, () => ({ ...activeBackground })),
  }),
  selectedRing: v.optional(colorSchema, { type: "theme", name: "interactive-accent" }),
});

export type AppearanceSliceState = v.InferOutput<typeof appearanceSliceSchema>;

export const appearanceSlice = defineSlice<"appearance", typeof appearanceSliceSchema>(
  "appearance",
  appearanceSliceSchema,
  {
    today: { color: todayColor, background: todayBackground },
    active: { color: activeColor, background: activeBackground },
    selectedRing: { type: "theme", name: "interactive-accent" },
  },
);
