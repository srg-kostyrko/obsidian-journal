import { WeekPresetApplierToken } from "@/calendar";
import { inject, type Module } from "@/infrastructure/di";
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { AddJournalFlow } from "./flows/add-journal.flow";
import { CloneJournalFlow } from "./flows/clone-journal.flow";
import { DeleteJournalFlow } from "./flows/delete-journal.flow";
import { EditFrontmatterFieldFlow } from "./flows/edit-frontmatter-field.flow";
import { EditSequencePropertyFlow } from "./flows/edit-sequence-property.flow";
import { RenameJournalFlow } from "./flows/rename-journal.flow";
import CollidingJournalsBlock from "./ui/CollidingJournalsBlock.vue";
import { journalEditSubpage } from "./ui/journals-subpage";
import { WeekPresetService } from "./week-preset-service";

export const journalsSettingsModule: Module = {
  register(c) {
    c.register(AddJournalFlow).useClass(AddJournalFlow);
    c.register(RenameJournalFlow).useClass(RenameJournalFlow);
    c.register(DeleteJournalFlow).useClass(DeleteJournalFlow);
    c.register(CloneJournalFlow).useClass(CloneJournalFlow);
    c.register(EditFrontmatterFieldFlow).useClass(EditFrontmatterFieldFlow);
    c.register(EditSequencePropertyFlow).useClass(EditSequencePropertyFlow);
    c.register(SubpageToken).useValue(journalEditSubpage);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "colliding-journals", component: CollidingJournalsBlock, order: 2 }),
    );
    // Eager: it subscribes to the settings reload seam, which fires whether or not anyone has
    // opened the preset picker that resolves it through WeekPresetApplierToken.
    c.register(WeekPresetService).useClass(WeekPresetService).eager();
    c.register(WeekPresetApplierToken).useFactory(() => inject(WeekPresetService));
  },
};
