import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { AddJournalFlow } from "./flows/add-journal.flow";
import { DeleteJournalFlow } from "./flows/delete-journal.flow";
import { EditFrontmatterFieldFlow } from "./flows/edit-frontmatter-field.flow";
import { EditSequencePropertyFlow } from "./flows/edit-sequence-property.flow";
import { RenameJournalFlow } from "./flows/rename-journal.flow";
import CollidingJournalsBlock from "./ui/CollidingJournalsBlock.vue";
import { journalEditSubpage } from "./ui/journals-subpage";

export const journalsSettingsModule: Module = {
  register(c) {
    c.register(AddJournalFlow).useClass(AddJournalFlow);
    c.register(RenameJournalFlow).useClass(RenameJournalFlow);
    c.register(DeleteJournalFlow).useClass(DeleteJournalFlow);
    c.register(EditFrontmatterFieldFlow).useClass(EditFrontmatterFieldFlow);
    c.register(EditSequencePropertyFlow).useClass(EditSequencePropertyFlow);
    c.register(SubpageToken).useValue(journalEditSubpage);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "colliding-journals", component: CollidingJournalsBlock, order: 2 }),
    );
  },
};
