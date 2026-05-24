import { defineSubpage } from "@/settings";

import ShelfEditSubpage from "./ShelfEditSubpage.vue";

export const shelfEditSubpage = defineSubpage<{ shelfName: string }>({
  key: "shelf-edit",
  component: ShelfEditSubpage,
});
