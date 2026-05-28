import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken, DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { viewsCollection } from "./config";
import { AddBlockToViewFlow } from "./flows/add-block-to-view.flow";
import { DeleteViewFlow } from "./flows/delete-view.flow";
import { EditViewNameFlow } from "./flows/edit-view-name.flow";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ViewsEventsToken, type ViewsEvents } from "./tokens";
import { viewEditSubpage } from "./ui/view-edit-subpage";
import ViewsDashboardBlock from "./ui/ViewsDashboardBlock.vue";
import { ViewHostService } from "./view-host";
import { ViewsViewModel } from "./view-model";

export const viewsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(viewsCollection);
    c.register(ViewsEventsToken).useFactory(() => createNanoEvents<ViewsEvents>());
    c.register(ViewsRepository).useClass(ViewsRepository).eager();
    c.register(ViewsViewModel).useClass(ViewsViewModel).eager();
    c.register(ViewsService).useClass(ViewsService).eager();
    c.register(ViewHostService).useClass(ViewHostService).eager();
    c.register(EditViewNameFlow).useClass(EditViewNameFlow);
    c.register(DeleteViewFlow).useClass(DeleteViewFlow);
    c.register(AddBlockToViewFlow).useClass(AddBlockToViewFlow);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "views", component: ViewsDashboardBlock, order: 7 }),
    );
    c.register(SubpageToken).useValue(viewEditSubpage);
  },
};
