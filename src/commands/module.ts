import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken } from "@/settings";

import { DynamicCommandRegistry } from "./command-registry";
import { commandCollection } from "./config";
import { DeleteCommandFlow } from "./flows/delete-command.flow";
import { EditCommandFlow } from "./flows/edit-command.flow";
import { CommandsRepository, type CommandsEvents } from "./repository";
import { CommandsEventsToken } from "./tokens";
import { commandsUiModule } from "./ui-module";
import { CommandsViewModel } from "./view-model";

export const commandsCoreModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(commandCollection);
    c.register(CommandsEventsToken).useFactory(() => createNanoEvents<CommandsEvents>());
    c.register(CommandsRepository).useClass(CommandsRepository).eager();
    c.register(CommandsViewModel).useClass(CommandsViewModel).eager();
    c.register(EditCommandFlow).useClass(EditCommandFlow);
    c.register(DeleteCommandFlow).useClass(DeleteCommandFlow);
  },
};

export const commandsStartupModule: Module = {
  register(c) {
    c.register(DynamicCommandRegistry).useClass(DynamicCommandRegistry).eager();
  },
};

export const commandsModule: Module = {
  register(c) {
    commandsCoreModule.register(c);
    commandsUiModule.register(c);
    commandsStartupModule.register(c);
  },
};
