import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { DeleteDecorationFlow } from "./flows/delete-decoration.flow";
import { EditDecorationFlow } from "./flows/edit-decoration.flow";
import { decorationsSlice } from "./slice";
import { decorationsSettingsUiModule } from "./ui-module";

export const decorationsSettingsCoreModule: Module = {
  register(c) {
    c.register(EditDecorationFlow).useClass(EditDecorationFlow);
    c.register(DeleteDecorationFlow).useClass(DeleteDecorationFlow);
    c.register(SliceDefinitionToken).useValue(decorationsSlice);
  },
};

export const decorationsSettingsModule: Module = {
  register(c) {
    decorationsSettingsCoreModule.register(c);
    decorationsSettingsUiModule.register(c);
  },
};
