import { defineSubpage } from "@/settings";

import JournalEditSubpage from "./JournalEditSubpage.vue";

import type { Component } from "vue";

export const journalEditSubpage = defineSubpage<{ journalName: string }>({
  key: "journal-edit",
  component: JournalEditSubpage as Component,
});
