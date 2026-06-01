import * as v from "valibot";

import { colorSchema } from "@/decorations";
import { defineSlice } from "@/settings";

const styleSchema = v.object({ color: colorSchema, background: colorSchema });

export const appearanceSliceSchema = v.object({
  today: styleSchema,
  active: styleSchema,
});

export type AppearanceSliceState = v.InferOutput<typeof appearanceSliceSchema>;

export const appearanceSlice = defineSlice<"appearance", typeof appearanceSliceSchema>(
  "appearance",
  appearanceSliceSchema,
  {
    today: { color: { type: "theme", name: "text-accent" }, background: { type: "transparent" } },
    active: {
      color: { type: "theme", name: "text-on-accent" },
      background: { type: "theme", name: "interactive-accent" },
    },
  },
);
