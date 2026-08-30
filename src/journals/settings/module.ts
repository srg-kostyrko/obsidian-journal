import { WeekPresetApplierToken } from "@/calendar";
import { inject, type Module } from "@/infrastructure/di";

import { AddJournalFlow } from "./flows/add-journal.flow";
import { AddNoteletTypeFlow } from "./flows/add-notelet-type.flow";
import { CloneJournalFlow } from "./flows/clone-journal.flow";
import { DeleteJournalFlow } from "./flows/delete-journal.flow";
import { EditFrontmatterFieldFlow } from "./flows/edit-frontmatter-field.flow";
import { EditNumberingDigitFlow } from "./flows/edit-numbering-digit.flow";
import { EditPromptFlow } from "./flows/edit-prompt.flow";
import { RenameJournalFlow } from "./flows/rename-journal.flow";
import { RenameNoteletTypeFlow } from "./flows/rename-notelet-type.flow";
import { journalsSettingsUiModule } from "./ui-module";
import { WeekPresetService } from "./week-preset-service";

export const journalsSettingsCoreModule: Module = {
  register(c) {
    c.register(AddJournalFlow).useClass(AddJournalFlow);
    c.register(RenameJournalFlow).useClass(RenameJournalFlow);
    c.register(DeleteJournalFlow).useClass(DeleteJournalFlow);
    c.register(CloneJournalFlow).useClass(CloneJournalFlow);
    c.register(EditFrontmatterFieldFlow).useClass(EditFrontmatterFieldFlow);
    c.register(EditNumberingDigitFlow).useClass(EditNumberingDigitFlow);
    c.register(EditPromptFlow).useClass(EditPromptFlow);
    c.register(AddNoteletTypeFlow).useClass(AddNoteletTypeFlow);
    c.register(RenameNoteletTypeFlow).useClass(RenameNoteletTypeFlow);
    // Eager: it subscribes to the settings reload seam, which fires whether or not anyone has
    // opened the preset picker that resolves it through WeekPresetApplierToken.
    c.register(WeekPresetService).useClass(WeekPresetService).eager();
    c.register(WeekPresetApplierToken).useFactory(() => inject(WeekPresetService));
  },
};

export const journalsSettingsModule: Module = {
  register(c) {
    journalsSettingsCoreModule.register(c);
    journalsSettingsUiModule.register(c);
  },
};
