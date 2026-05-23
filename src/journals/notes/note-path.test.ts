import { describe, it, expect, vi, beforeEach, afterEach, assert } from "vitest";

import type { AnchorString } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { JournalNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { fakeRepo, fixedJournal, unwrap } from "../testing";

import { NotePathService } from "./note-path";

import type { JournalConfig } from "../config";
import type { JournalMetadata } from "../types";

function buildContainer(repo: JournalsRepository): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(repo);
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
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("prefixes folder when configured", () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }),
    });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("Diary/2026/2026-05-19.md");
  });

  it("returns JournalNotFoundError for an unknown journal", () => {
    const repo = fakeRepo({});
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "missing", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("missing", meta);
    expect(result.isErr() && result.error instanceof JournalNotFoundError).toBe(true);
  });
});

describe("NotePathService.candidateFor", () => {
  it("inverts a {{date}}.md path into a metadata anchor", () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("daily", "2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
    expect(metadata.journalName).toBe("daily");
  });

  it("returns None when the path doesn't match the template", () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("daily", "Inbox/note.md" as VaultPath);
    expect(result.isNone()).toBe(true);
  });

  it("inverts folder + name combined", () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }),
    });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("daily", "Diary/2026/2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
  });

  it("captures numbering variables that appear only in the folder template", () => {
    const repo = fakeRepo({
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
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("sprints", "42 - Sprints/2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
    expect(metadata.numbers?.index).toBe(42);
  });

  it("captures numbering variables when present in the template", () => {
    const repo = fakeRepo({
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
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("issues", "Issue 42 - 2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
    expect(metadata.numbers?.index).toBe(42);
  });
});

function buildFixture(): { service: NotePathService; config: JournalConfig; metadata: JournalMetadata } {
  const config = fixedJournal("daily", { type: "day" }, { dateFormat: "DD/MM/YYYY" });
  const repo = fakeRepo({ daily: config });
  const service = buildContainer(repo).resolve(NotePathService);
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

  it("exposes current_date as a non-invertible YYYY-MM-DD date snapshot", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
    const context = service.contextFor(config, metadata);
    const spec = context.get("current_date");
    expect(spec?.kind).toBe("date");
    assert(spec?.kind === "date");
    expect(spec.value.toAnchor()).toBe("2026-05-20");
    expect(spec.invertible).toBe(false);
  });

  it("exposes time and current_time as the same clock spec object", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
    const context = service.contextFor(config, metadata);
    const time = context.get("time");
    const currentTime = context.get("current_time");
    expect(time?.kind).toBe("clock");
    assert(time?.kind === "clock");
    expect(time).toBe(currentTime);
    expect(time.defaultFormat).toBe("HH:mm");
  });
});

describe("bodyContextFor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aliases note_name and title to the same string spec", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
    const body = service.bodyContextFor(config, metadata, "2026-05-20");
    const noteName = body.get("note_name");
    const title = body.get("title");
    expect(noteName?.kind).toBe("string");
    assert(noteName?.kind === "string");
    expect(noteName.value).toBe("2026-05-20");
    expect(noteName).toBe(title);
  });

  it("inherits path-context variables", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
    const body = service.bodyContextFor(config, metadata, "2026-05-20");
    expect(body.get("date")).toBeDefined();
    expect(body.get("current_date")).toBeDefined();
    expect(body.get("time")).toBeDefined();
  });

  it("does not expose note_name in the path context", () => {
    const { service, config, metadata } = buildFixture();
    const path = service.contextFor(config, metadata);
    expect(path.get("note_name")).toBeUndefined();
    expect(path.get("title")).toBeUndefined();
  });
});
