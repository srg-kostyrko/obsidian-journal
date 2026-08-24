import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken } from "@/settings";

import { shelvesCollection } from "./config";
import { DeleteShelfFlow } from "./flows/delete-shelf.flow";
import { EditShelfNameFlow } from "./flows/edit-shelf-name.flow";
import { PlaceJournalFlow } from "./flows/place-journal.flow";
import { ShelvesRepository, type ShelvesEvents } from "./repository";
import { ShelvesService } from "./service";
import { ShelvesEventsToken } from "./tokens";
import { shelvesUiModule } from "./ui-module";
import { ShelvesViewModel } from "./view-model";

export const shelvesCoreModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(shelvesCollection);
    c.register(ShelvesEventsToken).useFactory(() => createNanoEvents<ShelvesEvents>());
    c.register(ShelvesRepository).useClass(ShelvesRepository).eager();
    c.register(ShelvesViewModel).useClass(ShelvesViewModel).eager();
    c.register(ShelvesService).useClass(ShelvesService).eager();
    c.register(EditShelfNameFlow).useClass(EditShelfNameFlow);
    c.register(DeleteShelfFlow).useClass(DeleteShelfFlow);
    c.register(PlaceJournalFlow).useClass(PlaceJournalFlow);
  },
};

export const shelvesModule: Module = {
  register(c) {
    shelvesCoreModule.register(c);
    shelvesUiModule.register(c);
  },
};
