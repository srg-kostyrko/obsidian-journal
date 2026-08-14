import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { DashboardBlockToken, SliceDefinitionToken, defineDashboardBlock } from "@/settings";
import { ShelfEditSectionToken, defineShelfEditSection } from "@/shelves/ui/shelf-edit-section";

import { DeleteDecorationFlow } from "./flows/delete-decoration.flow";
import { EditDecorationFlow } from "./flows/edit-decoration.flow";
import { decorationsSlice } from "./slice";
import CalendarDecorationsBlock from "./ui/CalendarDecorationsBlock.vue";
import JournalDecorationsSection from "./ui/JournalDecorationsSection.vue";
import ShelfDecorationsSection from "./ui/ShelfDecorationsSection.vue";

export const decorationsSettingsModule: Module = {
  register(c) {
    c.register(EditDecorationFlow).useClass(EditDecorationFlow);
    c.register(DeleteDecorationFlow).useClass(DeleteDecorationFlow);
    c.register(SliceDefinitionToken).useValue(decorationsSlice);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "decorations", order: 100, component: JournalDecorationsSection }),
    );
    c.register(ShelfEditSectionToken).useValue(
      defineShelfEditSection({ key: "decorations", order: 100, component: ShelfDecorationsSection }),
    );
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "calendar-decorations", component: CalendarDecorationsBlock, order: 11 }),
    );
  },
};
