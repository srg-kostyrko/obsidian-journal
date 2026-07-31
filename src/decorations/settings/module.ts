import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { SliceDefinitionToken } from "@/settings";

import { DeleteDecorationFlow } from "./flows/delete-decoration.flow";
import { EditDecorationFlow } from "./flows/edit-decoration.flow";
import { decorationsSlice } from "./slice";
import DecorationsSection from "./ui/DecorationsSection.vue";

export const decorationsSettingsModule: Module = {
  register(c) {
    c.register(EditDecorationFlow).useClass(EditDecorationFlow);
    c.register(DeleteDecorationFlow).useClass(DeleteDecorationFlow);
    c.register(SliceDefinitionToken).useValue(decorationsSlice);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({
        key: "decorations",
        order: 100,
        component: DecorationsSection,
      }),
    );
  },
};
