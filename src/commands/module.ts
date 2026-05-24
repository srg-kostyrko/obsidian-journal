import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { CollectionDefinitionToken, DashboardBlockToken, defineDashboardBlock } from "@/settings";
import { ShelfEditSectionToken, defineShelfEditSection } from "@/shelves";

import { DynamicCommandRegistry } from "./command-registry";
import { commandCollection } from "./config";
import { CommandsRepository, type CommandsEvents } from "./repository";
import { CommandsEventsToken } from "./tokens";
import CommandsDashboardBlock from "./ui/CommandsDashboardBlock.vue";
import { DeleteCommandFlow } from "./ui/delete-command.flow";
import { EditCommandFlow } from "./ui/edit-command.flow";
import JournalCommandsSection from "./ui/JournalCommandsSection.vue";
import ShelfCommandsSection from "./ui/ShelfCommandsSection.vue";
import { CommandsViewModel } from "./view-model";

export const commandsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(commandCollection);
    c.register(DynamicCommandRegistry).useClass(DynamicCommandRegistry).eager();
    c.register(EditCommandFlow).useClass(EditCommandFlow);
    c.register(DeleteCommandFlow).useClass(DeleteCommandFlow);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "commands", component: CommandsDashboardBlock, order: 6 }),
    );
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "commands", component: JournalCommandsSection, order: 10 }),
    );
    c.register(ShelfEditSectionToken).useValue(
      defineShelfEditSection({ key: "commands", component: ShelfCommandsSection, order: 10 }),
    );
    c.register(CommandsEventsToken).useFactory(() => createNanoEvents<CommandsEvents>());
    c.register(CommandsRepository).useClass(CommandsRepository).eager();
    c.register(CommandsViewModel).useClass(CommandsViewModel).eager();
  },
};
