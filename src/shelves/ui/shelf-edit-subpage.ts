import { defineSubpage } from "@/settings";

import ShelfEditSubpage from "./ShelfEditSubpage.vue";

import type { Component } from "vue";

export const shelfEditSubpage = defineSubpage<{ shelfName: string }>({
  key: "shelf-edit",
  component: ShelfEditSubpage as Component,
});
