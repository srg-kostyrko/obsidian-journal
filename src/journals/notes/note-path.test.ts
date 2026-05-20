import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { AnchorString } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { SettingsService } from "@/settings";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { JournalNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { fakeSettings, fixedJournal, unwrap } from "../testing";

import { NotePathService } from "./note-path";

import type { JournalConfig } from "../config";
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

describe("NotePathService.candidateFor", () => {
  it("inverts a {{date}}.md path into a metadata anchor", () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(settings);
    const result = c.resolve(NotePathService).candidateFor("daily", "2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
    expect(metadata.journalName).toBe("daily");
  });

  it("returns None when the path doesn't match the template", () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(settings);
    const result = c.resolve(NotePathService).candidateFor("daily", "Inbox/note.md" as VaultPath);
    expect(result.isNone()).toBe(true);
  });

  it("inverts folder + name combined", () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }),
    });
    const c = buildContainer(settings);
    const result = c.resolve(NotePathService).candidateFor("daily", "Diary/2026/2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
  });

  it("captures numbering variables that appear only in the folder template", () => {
    const settings = fakeSettings({
      sprints: fixedJournal(
        "sprints",
        { type: "day" },
        {
          folder: "{{index}} - Sprints",
          nameTemplate: "{{date}}",
          numbering: {
            enabled: true,
            anchorDate: "2026-01-01" as AnchorString,
            allowBefore: false,
            sources: [{ variable: "index", frontmatterKey: "sprint-number", anchorValue: 1, reset: { kind: "never" } }],
          },
        },
      ),
    });
    const c = buildContainer(settings);
    const result = c.resolve(NotePathService).candidateFor("sprints", "42 - Sprints/2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
    expect(metadata.numbers?.index).toBe(42);
  });

  it("captures numbering variables when present in the template", () => {
    const settings = fakeSettings({
      issues: fixedJournal(
        "issues",
        { type: "day" },
        {
          nameTemplate: "Issue {{index}} - {{date}}",
          numbering: {
            enabled: true,
            anchorDate: "2026-01-01" as AnchorString,
            allowBefore: false,
            sources: [{ variable: "index", frontmatterKey: "issue-number", anchorValue: 1, reset: { kind: "never" } }],
          },
        },
      ),
    });
    const c = buildContainer(settings);
    const result = c.resolve(NotePathService).candidateFor("issues", "Issue 42 - 2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
    expect(metadata.numbers?.index).toBe(42);
  });
});

function buildFixture(): { service: NotePathService; config: JournalConfig; metadata: JournalMetadata } {
  const config = fixedJournal("daily", { type: "day" });
  const settings = fakeSettings({ daily: config });
  const service = buildContainer(settings).resolve(NotePathService);
  const metadata: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-20") };
  return { service, config, metadata };
}

describe("contextFor — render-time variables", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes current_date with the dateFormat as default", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
    const context = service.contextFor(config, metadata);
    const spec = context.get("current_date");
    expect(spec?.kind).toBe("date");
    expect(spec?.kind === "date" && spec.value.toAnchor()).toBe("2026-05-20");
    expect(spec?.kind === "date" && spec.invertible).toBe(false);
  });

  it("exposes time and current_time as the same clock spec object", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
    const context = service.contextFor(config, metadata);
    const time = context.get("time");
    const currentTime = context.get("current_time");
    expect(time?.kind).toBe("clock");
    expect(time).toBe(currentTime);
    expect(time?.kind === "clock" && time.defaultFormat).toBe("HH:mm");
  });
});
