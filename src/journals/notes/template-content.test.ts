import { describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { expectOk } from "@/infrastructure/result/testing";
import { SettingsService } from "@/settings";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { fakeSettings, fixedJournal } from "../testing";

import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

import type { JournalMetadata } from "../types";

function build(settings: SettingsService, notes: FakeNotesService, templater = new FakeTemplaterService()): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(TemplaterService).useValue(templater as unknown as TemplaterService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  return c;
}

const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

describe("TemplateContentService.renderFor", () => {
  it("resolves to empty string when no templates are configured", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const result = await build(settings, notes)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "note.md" as VaultPath);
    expect(result.isOk() && result.value).toBe("");
  });

  it("renders the first existing template content through the engine", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/missing.md", "Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# {{date}}\n");
    const result = await build(settings, notes)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "note.md" as VaultPath);
    expect(result.isOk() && result.value).toBe("# 2026-05-19\n");
  });

  it("renders the template path itself through the engine before looking it up", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/{{date:YYYY}}/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/2026/daily.md" as VaultPath, "body");
    const result = await build(settings, notes)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "note.md" as VaultPath);
    expect(result.isOk() && result.value).toBe("body");
  });

  it("returns empty string when none of the configured templates exist", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/missing.md"] }),
    });
    const notes = new FakeNotesService();
    const result = await build(settings, notes)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "note.md" as VaultPath);
    expect(result.isOk() && result.value).toBe("");
  });
});

describe("TemplateContentService.renderFor — note_name binding", () => {
  it("exposes note_name to template body matching the rendered basename", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "{{note_name}}");
    const result = await build(settings, notes)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-20", "note.md" as VaultPath);
    expectOk(result);
    expect(result.value).toBe("2026-05-20");
  });

  it("aliases title to note_name in template body", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "{{title}}");
    const result = await build(settings, notes)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "my-note", "note.md" as VaultPath);
    expectOk(result);
    expect(result.value).toBe("my-note");
  });

  it("does not expose note_name when resolving the templatePath itself", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/{{note_name}}.md"] }),
    });
    const notes = new FakeNotesService();
    const result = await build(settings, notes)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-20", "note.md" as VaultPath);
    expectOk(result);
    expect(result.value).toBe("");
  });
});

describe("TemplateContentService.renderFor — Templater", () => {
  it("passes engine-rendered content through Templater", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# {{date}}");
    const templater = new FakeTemplaterService();
    templater.setTransform((content) => `${content} [templated]`);
    const result = await build(settings, notes, templater)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);
    expectOk(result);
    expect(result.value).toBe("# 2026-05-19 [templated]");
  });

  it("passes the winning template path and target path to Templater", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "body");
    const templater = new FakeTemplaterService();
    await build(settings, notes, templater)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);
    expect(templater.applyCalls).toEqual([
      { templatePath: "Templates/daily.md", targetPath: "2026-05-19.md", content: "body" },
    ]);
  });

  it("does not invoke Templater when no templates are configured", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const templater = new FakeTemplaterService();
    await build(settings, notes, templater)
      .resolve(TemplateContentService)
      .renderFor("daily", meta, "2026-05-19", "2026-05-19.md" as VaultPath);
    expect(templater.applyCalls).toEqual([]);
  });
});
