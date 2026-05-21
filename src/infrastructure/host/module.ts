import type { Module } from "@/infrastructure/di";

import { InputSuggestService } from "./input-suggests/internal/input-suggest-service";
import { NotesService } from "./internal/notes-service";
import { PluginData } from "./internal/plugin-data";
import { TemplaterService } from "./internal/templater-service";
import { InternalObsidianAppToken, InternalPluginToken } from "./internal/tokens";
import { WorkspaceService } from "./internal/workspace-service";
import { modalsModule } from "./modals/module";
import { SuggestService } from "./suggests/internal/suggest-service";

import type { Plugin } from "obsidian";

export function createHostModule(plugin: Plugin): Module {
  return {
    register(c) {
      c.register(InternalPluginToken).useValue(plugin);
      c.register(InternalObsidianAppToken).useValue(plugin.app);
      c.register(NotesService).useClass(NotesService).eager();
      c.register(WorkspaceService).useClass(WorkspaceService).eager();
      c.register(TemplaterService).useClass(TemplaterService);
      c.register(PluginData).useClass(PluginData);
      c.register(SuggestService).useClass(SuggestService);
      c.register(InputSuggestService).useClass(InputSuggestService);
      modalsModule.register(c);
    },
  };
}
