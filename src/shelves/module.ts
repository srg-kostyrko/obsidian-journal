import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { CollectionDefinitionToken, DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { shelvesCollection } from "./config";
import { ShelvesRepository, type ShelvesEvents } from "./repository";
import { ShelvesService } from "./service";
import { ShelvesEventsToken } from "./tokens";
import { DeleteShelfFlow } from "./ui/delete-shelf.flow";
import { EditShelfNameFlow } from "./ui/edit-shelf-name.flow";
import JournalsDashboardBlock from "./ui/JournalsDashboardBlock.vue";
import JournalShelfSection from "./ui/JournalShelfSection.vue";
import { PlaceJournalFlow } from "./ui/place-journal.flow";
import { shelfEditSubpage } from "./ui/shelf-edit-subpage";
import ShelvesDashboardBlock from "./ui/ShelvesDashboardBlock.vue";
import { ShelvesViewModel } from "./view-model";

import type { Component } from "vue";

export const shelvesModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(shelvesCollection);
    c.register(ShelvesEventsToken).useFactory(() => createNanoEvents<ShelvesEvents>());
    c.register(ShelvesRepository).useClass(ShelvesRepository).eager();
    c.register(ShelvesViewModel).useClass(ShelvesViewModel).eager();
    c.register(ShelvesService).useClass(ShelvesService).eager();
    c.register(EditShelfNameFlow).useClass(EditShelfNameFlow);
    c.register(DeleteShelfFlow).useClass(DeleteShelfFlow);
    c.register(PlaceJournalFlow).useClass(PlaceJournalFlow);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "shelves", component: ShelvesDashboardBlock as Component, order: 4 }),
    );
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "journals", component: JournalsDashboardBlock as Component, order: 5 }),
    );
    c.register(SubpageToken).useValue(shelfEditSubpage);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "shelf", component: JournalShelfSection as Component, order: 5 }),
    );
  },
};
