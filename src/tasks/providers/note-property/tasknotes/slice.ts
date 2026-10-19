import * as v from "valibot";

import { defineSlice } from "@/settings";

export const taskNotesNoticeSliceSchema = v.object({
  dismissed: v.optional(v.boolean(), false),
});

export const taskNotesNoticeSlice = defineSlice<"tasknotesNotice", typeof taskNotesNoticeSliceSchema>(
  "tasknotesNotice",
  taskNotesNoticeSliceSchema,
  { dismissed: false },
);
