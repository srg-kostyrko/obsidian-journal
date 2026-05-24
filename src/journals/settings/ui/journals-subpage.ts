import { defineSubpage } from "@/settings";

import JournalEditSubpage from "./JournalEditSubpage.vue";

export const journalEditSubpage = defineSubpage<{ journalName: string }>({
  key: "journal-edit",
  component: JournalEditSubpage,
});
