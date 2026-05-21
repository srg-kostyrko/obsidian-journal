import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { CollectionDefinitionToken, DashboardBlockToken, defineDashboardBlock } from "@/settings";

import { DynamicCommandRegistry } from "./command-registry";
import { commandCollection } from "./config";
import CommandsDashboardBlock from "./ui/CommandsDashboardBlock.vue";
import { DeleteCommandFlow } from "./ui/delete-command.flow";
import { EditCommandFlow } from "./ui/edit-command.flow";
import JournalCommandsSection from "./ui/JournalCommandsSection.vue";

import type { Component } from "vue";

export const commandsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(commandCollection);
    c.register(DynamicCommandRegistry).useClass(DynamicCommandRegistry).eager();
    c.register(EditCommandFlow).useClass(EditCommandFlow);
    c.register(DeleteCommandFlow).useClass(DeleteCommandFlow);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "commands", component: CommandsDashboardBlock as Component, order: 6 }),
    );
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "commands", component: JournalCommandsSection as Component, order: 10 }),
    );
  },
};
