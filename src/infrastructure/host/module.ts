import type { Module } from "@/infrastructure/di";

import { CodeBlockService } from "./code-blocks/internal/code-block-service";
import { CommandService } from "./commands/internal/command-service";
import { InputSuggestService } from "./input-suggests/internal/input-suggest-service";
import { MarkdownRenderService } from "./internal/markdown-render-service";
import { NoteMetadataService } from "./internal/note-metadata-service";
import { NotesService } from "./internal/notes-service";
import { NoticeService } from "./internal/notice-service";
import { PluginData } from "./internal/plugin-data";
import { TemplaterService } from "./internal/templater-service";
import { InternalObsidianAppToken, InternalPluginToken } from "./internal/tokens";
import { WorkspaceService } from "./internal/workspace-service";
import { modalsModule } from "./modals/module";
import { SuggestService } from "./suggests/internal/suggest-service";
import { UriService } from "./uri/internal/uri-service";

import type { Plugin } from "obsidian";

export function createHostModule(plugin: Plugin): Module {
  return {
    register(c) {
      c.register(InternalPluginToken).useValue(plugin);
      c.register(InternalObsidianAppToken).useValue(plugin.app);
      c.register(NotesService).useClass(NotesService).eager();
      c.register(NoteMetadataService).useClass(NoteMetadataService);
      c.register(MarkdownRenderService).useClass(MarkdownRenderService);
      c.register(NoticeService).useClass(NoticeService);
      c.register(WorkspaceService).useClass(WorkspaceService).eager();
      c.register(TemplaterService).useClass(TemplaterService);
      c.register(PluginData).useClass(PluginData);
      c.register(SuggestService).useClass(SuggestService);
      c.register(InputSuggestService).useClass(InputSuggestService);
      c.register(CommandService).useClass(CommandService);
      c.register(UriService).useClass(UriService);
      c.register(CodeBlockService).useClass(CodeBlockService).eager();
      modalsModule.register(c);
    },
  };
}
