import type { Module } from "@/infrastructure/di";

import { NotesService } from "./internal/notes-service";
import { PluginData } from "./internal/plugin-data";
import { InternalObsidianAppToken, InternalPluginToken } from "./internal/tokens";
import { WorkspaceService } from "./internal/workspace-service";
import { createModalsModule } from "./modals/module";

import type { Plugin } from "obsidian";

export function createHostModule(plugin: Plugin): Module {
  const modals = createModalsModule();
  return {
    register(c) {
      c.register(InternalPluginToken).useValue(plugin);
      c.register(InternalObsidianAppToken).useValue(plugin.app);
      c.register(NotesService).useClass(NotesService).eager();
      c.register(WorkspaceService).useClass(WorkspaceService).eager();
      c.register(PluginData).useClass(PluginData);
      modals.register(c);
    },
  };
}
