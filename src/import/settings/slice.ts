import * as v from "valibot";

import { defineSlice } from "@/settings";

export const importNoticeSliceSchema = v.object({
  dismissed: v.optional(v.boolean(), false),
});

export const importNoticeSlice = defineSlice<"importNotice", typeof importNoticeSliceSchema>(
  "importNotice",
  importNoticeSliceSchema,
  { dismissed: false },
);
