import { defineSubpage } from "@/settings";

import ViewEditSubpage from "./ViewEditSubpage.vue";

import type { ViewId } from "../config";

export const viewEditSubpage = defineSubpage<{ viewId: ViewId }>({
  key: "view-edit",
  component: ViewEditSubpage,
});
