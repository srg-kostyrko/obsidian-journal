import { createMultiToken, createToken } from "@/infrastructure/di";
import type { RepositoryEvents } from "@/infrastructure/repository";

import type { View, ViewId } from "./config";
import type { ToolbarItemDefinition } from "./define-toolbar-item";
import type { ViewBlockDefinition } from "./define-view-block";
import type { Emitter } from "nanoevents";

// BaseRepository emits `created(id)`, `updated(id, changes)`, `deleted(id)` for us;
// we do not add custom events at foundation-time.
export type ViewsEvents = RepositoryEvents<ViewId, View>;

export const ViewBlockDefinitionToken = createMultiToken<ViewBlockDefinition>("views.block");
export const ToolbarItemDefinitionToken = createMultiToken<ToolbarItemDefinition>("views.toolbar-item");
export const ViewsEventsToken = createToken<Emitter<ViewsEvents>>("views.events");
