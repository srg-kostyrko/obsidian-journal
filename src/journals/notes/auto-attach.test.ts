import { describe, it, expect, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { SettingsService } from "@/settings";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { fakeSettings, fixedJournal } from "../testing";
import { TimelineService } from "../timeline";

import { AutoAttachService } from "./auto-attach";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

function build(settings: SettingsService, notes: FakeNotesService): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(TimelineService).useClass(TimelineService);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(AutoAttachService).useClass(AutoAttachService);
  return c;
}

describe("AutoAttachService", () => {
  it("attaches a newly-created note matching exactly one journal", async () => {
    const settings = fakeSettings({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await notes.create("2026-05-19.md" as VaultPath, "");
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe("daily");
    expect(spy.mock.calls[0]?.[1]).toBe("2026-05-19.md");
    expect(spy.mock.calls[0]?.[2]).toMatchObject({ journalName: "daily", anchor: "2026-05-19" });
  });

  it("does nothing for a path that doesn't match any journal", async () => {
    const settings = fakeSettings({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { folder: "Diary", timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    await container.resolve(AutoAttachService).initialize();
    await notes.create("Inbox/random.md" as VaultPath, "");
    await new Promise((r) => window.setTimeout(r, 0));
    expect(
      container
        .resolve(JournalsIndex)
        .entryByPath("Inbox/random.md" as VaultPath)
        .isNone(),
    ).toBe(true);
  });

  it("does nothing when the path matches multiple journals", async () => {
    const settings = fakeSettings({
      a: fixedJournal("a", { type: "day" }, { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } }),
      b: fixedJournal("b", { type: "day" }, { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } }),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await notes.create("2026-05-19.md" as VaultPath, "");
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips paths the plugin just created via ensureNote", async () => {
    const settings = fakeSettings({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    const creation = container.resolve(NoteCreationService);
    const attachSpy = vi.spyOn(creation, "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await creation.ensureNote("daily", { journalName: "daily", anchor: anchor("2026-05-19") });
    await new Promise((r) => window.setTimeout(r, 0));
    expect(attachSpy).not.toHaveBeenCalled();
  });

  it("filters candidates by timeline.contains", async () => {
    const settings = fakeSettings({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2026-06-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(settings, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await notes.create("2026-05-19.md" as VaultPath, "");
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });
});
