import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { AddJournalFlow } from "./flows/add-journal.flow";
import { DeleteJournalFlow } from "./flows/delete-journal.flow";
import { EditFrontmatterFieldFlow } from "./flows/edit-frontmatter-field.flow";
import { EditSequencePropertyFlow } from "./flows/edit-sequence-property.flow";
import { RenameJournalFlow } from "./flows/rename-journal.flow";
import { JournalLifecycleService } from "./lifecycle";
import { journalEditSubpage } from "./ui/journals-subpage";
import JournalsDashboardBlock from "./ui/JournalsDashboardBlock.vue";

import type { Component } from "vue";

export const journalsSettingsModule: Module = {
  register(c) {
    c.register(JournalLifecycleService).useClass(JournalLifecycleService);
    c.register(AddJournalFlow).useClass(AddJournalFlow);
    c.register(RenameJournalFlow).useClass(RenameJournalFlow);
    c.register(DeleteJournalFlow).useClass(DeleteJournalFlow);
    c.register(EditFrontmatterFieldFlow).useClass(EditFrontmatterFieldFlow);
    c.register(EditSequencePropertyFlow).useClass(EditSequencePropertyFlow);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "journals", component: JournalsDashboardBlock as Component, order: 5 }),
    );
    c.register(SubpageToken).useValue(journalEditSubpage);
  },
};
