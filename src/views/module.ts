import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { CollectionDefinitionToken, DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { customIntervalsBlock } from "./blocks/custom-intervals/custom-intervals-block";
import IntervalBlockSection from "./blocks/custom-intervals/ui/IntervalBlockSection.vue";
import { dividerBlock } from "./blocks/divider/divider-block";
import { monthCalendarBlock } from "./blocks/month-calendar/month-calendar-block";
import { toolbarBlock } from "./blocks/toolbar/toolbar-block";
import { weekCalendarBlock } from "./blocks/week-calendar/week-calendar-block";
import { viewsCollection } from "./config";
import { AddBlockToViewFlow } from "./flows/add-block-to-view.flow";
import { AddToolbarItemToBlockFlow } from "./flows/add-toolbar-item-to-block.flow";
import { DeleteViewFlow } from "./flows/delete-view.flow";
import { EditViewNameFlow } from "./flows/edit-view-name.flow";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ToolbarItemDefinitionToken, ViewBlockDefinitionToken, ViewsEventsToken, type ViewsEvents } from "./tokens";
import { buttonItem } from "./toolbar-items/button/button-item";
import { periodButtonsItem } from "./toolbar-items/period-buttons/period-buttons-item";
import { shelfSelectorItem } from "./toolbar-items/shelf-selector/shelf-selector-item";
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
    c.register(AddToolbarItemToBlockFlow).useClass(AddToolbarItemToBlockFlow);

    c.register(ViewBlockDefinitionToken).useValue(dividerBlock);
    c.register(ViewBlockDefinitionToken).useValue(toolbarBlock);
    c.register(ViewBlockDefinitionToken).useValue(monthCalendarBlock);
    c.register(ViewBlockDefinitionToken).useValue(weekCalendarBlock);
    c.register(ViewBlockDefinitionToken).useValue(customIntervalsBlock);

    c.register(ToolbarItemDefinitionToken).useValue(shelfSelectorItem);
    c.register(ToolbarItemDefinitionToken).useValue(periodButtonsItem);
    c.register(ToolbarItemDefinitionToken).useValue(buttonItem);

    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "views", component: ViewsDashboardBlock, order: 7 }),
    );
    c.register(SubpageToken).useValue(viewEditSubpage);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "interval-block", order: 41, component: IntervalBlockSection }),
    );
  },
};
