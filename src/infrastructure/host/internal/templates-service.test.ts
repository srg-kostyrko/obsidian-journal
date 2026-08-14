import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { FakeNotesService } from "@/infrastructure/host/testing";

import { NotesService } from "./notes-service";
import { TemplaterService } from "./templater-service";
import { TemplatesService } from "./templates-service";
import { InternalObsidianAppToken } from "./tokens";

import type { VaultPath } from "../types";
import type { App } from "obsidian";

function fakeApp(coreFolder: string | null): App {
  return {
    internalPlugins: {
      getPluginById: (id: string): unknown =>
        id === "templates" && coreFolder !== null ? { instance: { options: { folder: coreFolder } } } : null,
    },
  } as unknown as App;
}

function build(options: { coreFolder?: string | null; templaterFolder?: string | null; notes?: string[] } = {}): {
  service: TemplatesService;
} {
  const notes = new FakeNotesService();
  const notesToSeed = options.notes ?? [];
  for (const path of notesToSeed) notes.seed(path as VaultPath);
  const templater = { templatesFolder: () => options.templaterFolder ?? null } as unknown as TemplaterService;

  const c = new Container();
  c.register(InternalObsidianAppToken).useValue(fakeApp(options.coreFolder ?? null));
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(TemplaterService).useValue(templater);
  c.register(TemplatesService).useClass(TemplatesService);
  return { service: c.resolve(TemplatesService) };
}

describe("TemplatesService.templateFolders", () => {
  it("unions the core Templates folder and the Templater folder", () => {
    const { service } = build({ coreFolder: "Templates", templaterFolder: "Meta/Templater" });
    expect(service.templateFolders().toSorted()).toEqual(["Meta/Templater", "Templates"]);
  });

  it("de-duplicates when both sources name the same folder", () => {
    const { service } = build({ coreFolder: "Templates", templaterFolder: "Templates" });
    expect(service.templateFolders()).toEqual(["Templates"]);
  });

  it("strips a trailing slash from a configured folder", () => {
    const { service } = build({ coreFolder: "Templates/", templaterFolder: null });
    expect(service.templateFolders()).toEqual(["Templates"]);
  });

  // cSpell:ignore unconfigured
  it("treats an empty-string folder as unconfigured", () => {
    const { service } = build({ coreFolder: "", templaterFolder: null });
    expect(service.templateFolders()).toEqual([]);
  });

  it("treats a root folder as unconfigured", () => {
    const { service } = build({ coreFolder: "/", templaterFolder: null });
    expect(service.templateFolders()).toEqual([]);
  });
});

describe("TemplatesService.candidatePaths", () => {
  it("returns notes under the core Templates folder", () => {
    const { service } = build({
      coreFolder: "Templates",
      notes: ["Templates/daily.md", "Journal/2026.md"],
    });
    expect(service.candidatePaths()).toEqual(["Templates/daily.md"]);
  });

  it("includes notes in subfolders of a configured folder", () => {
    const { service } = build({
      coreFolder: "Templates",
      notes: ["Templates/journals/daily.md", "Other/x.md"],
    });
    expect(service.candidatePaths()).toEqual(["Templates/journals/daily.md"]);
  });

  it("returns notes under the Templater folder when only Templater is configured", () => {
    const { service } = build({
      templaterFolder: "Meta/Templater",
      notes: ["Meta/Templater/t.md", "Journal/2026.md"],
    });
    expect(service.candidatePaths()).toEqual(["Meta/Templater/t.md"]);
  });

  it("falls back to all markdown notes when no folder is configured", () => {
    const { service } = build({ notes: ["a.md", "b.md"] });
    expect(service.candidatePaths().toSorted()).toEqual(["a.md", "b.md"]);
  });

  it("does not match a folder name as a path prefix of an unrelated folder", () => {
    const { service } = build({
      coreFolder: "Templates",
      notes: ["TemplatesArchive/old.md", "Templates/daily.md"],
    });
    expect(service.candidatePaths()).toEqual(["Templates/daily.md"]);
  });
});
