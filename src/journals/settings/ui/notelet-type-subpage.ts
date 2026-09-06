import { defineSubpage } from "@/settings";

import NoteletTypeSubpage from "./NoteletTypeSubpage.vue";

export const noteletTypeSubpage = defineSubpage<{ journalName: string; typeId: string }>({
  key: "notelet-type-edit",
  component: NoteletTypeSubpage,
});
