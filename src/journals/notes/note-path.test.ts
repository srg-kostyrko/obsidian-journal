import { describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { SettingsService } from "@/settings";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { JournalNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { fakeSettings, fixedJournal } from "../testing";

import { NotePathService } from "./note-path";

import type { JournalMetadata } from "../types";

function buildContainer(settings: SettingsService): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  return c;
}

describe("NotePathService.pathFor", () => {
  it("renders nameTemplate with .md suffix when folder is empty", () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(settings);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("prefixes folder when configured", () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }),
    });
    const c = buildContainer(settings);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("Diary/2026/2026-05-19.md");
  });

  it("returns JournalNotFoundError for an unknown journal", () => {
    const settings = fakeSettings({});
    const c = buildContainer(settings);
    const meta: JournalMetadata = { journalName: "missing", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("missing", meta);
    expect(result.isErr() && result.error instanceof JournalNotFoundError).toBe(true);
  });
});
