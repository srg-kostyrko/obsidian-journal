import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { NotesService, PluginData, TemplaterService, WorkspaceService, NoticeService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import {
  FakeNotesService,
  FakePluginData,
  FakeTemplaterService,
  FakeWorkspaceService,
  FakeNoticeService,
} from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { SettingsEventsToken, SettingsService, SliceDefinitionToken, type SettingsEvents } from "@/settings";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { OpenJournalEntryFlow } from "../flows/open-journal-entry.flow";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NoteCreationService } from "../notes/note-creation";
import { NotePathService } from "../notes/note-path";
import { SelfWriteGuard } from "../notes/self-write-guard";
import { TemplateContentService } from "../notes/template-content";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { fixedJournal } from "../testing";
import { JournalsEventsToken } from "../tokens";

import { startupSlice } from "./slice";
import { StartupOpenService } from "./startup-open";

import type { JournalConfig } from "../config";
import type { JournalsEvents } from "../repository";
import type { Emitter } from "nanoevents";

interface Harness {
  readonly container: Container;
  readonly repo: JournalsRepository;
  readonly events: Emitter<JournalsEvents>;
  readonly workspace: FakeWorkspaceService;
  readonly settings: SettingsService;
  readonly notes: FakeNotesService;
}

function build(journals: Record<string, JournalConfig>): Harness {
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(journals, events);
  const workspace = new FakeWorkspaceService();
  const notes = new FakeNotesService();

  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);
  c.register(NoticeService).useValue(new FakeNoticeService());
  c.register(PluginData).useValue(new FakePluginData() as unknown as PluginData);
  c.register(SliceDefinitionToken).useValue(startupSlice);
  c.register(SettingsEventsToken).useValue(createNanoEvents<SettingsEvents>());
  c.register(SettingsService).useClass(SettingsService);
  c.register(JournalsRepository).useValue(repo);
  c.register(JournalsEventsToken).useValue(events);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  c.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(SelfWriteGuard).useClass(SelfWriteGuard);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(OpenJournalEntryFlow).useClass(OpenJournalEntryFlow);
  c.register(StartupOpenService).useClass(StartupOpenService);

  return { container: c, repo, events, workspace, settings: c.resolve(SettingsService), notes };
}

const TODAY_PATH = "2026-05-19.md" as VaultPath;

describe("StartupOpenService", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 9, 0, 0));
  });
  afterEach(() => {
    teardown();
    vi.useRealTimers();
  });

  it("opens the configured journal's today note on a genuine launch", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "daily" };
    h.workspace.setLayoutReady(false);

    await h.container.resolve(StartupOpenService).initialize();
    h.workspace.setLayoutReady(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(h.workspace.isOpen(TODAY_PATH)).toBe(true);
  });

  it("writes the canonical period anchor as journal-date for a non-daily journal", async () => {
    const h = build({ monthly: fixedJournal("monthly", { type: "month" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "monthly" };
    h.workspace.setLayoutReady(false);

    await h.container.resolve(StartupOpenService).initialize();
    h.workspace.setLayoutReady(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(h.notes.frontmatterOf("2026-05.md" as VaultPath)?.["journal-date"]).toBe("2026-05-01");
  });

  it("does not open when the layout was already ready at initialize", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "daily" };
    h.workspace.setLayoutReady(true);

    await h.container.resolve(StartupOpenService).initialize();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.workspace.isOpen(TODAY_PATH)).toBe(false);
  });

  it("does nothing when no journal is configured", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.workspace.setLayoutReady(false);

    await h.container.resolve(StartupOpenService).initialize();
    h.workspace.setLayoutReady(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(h.workspace.isOpen(TODAY_PATH)).toBe(false);
  });

  it("does nothing when the configured journal no longer exists", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "ghost" };
    h.workspace.setLayoutReady(false);

    await h.container.resolve(StartupOpenService).initialize();
    h.workspace.setLayoutReady(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(h.workspace.isOpen(TODAY_PATH)).toBe(false);
  });

  it("updates the stored journal name when that journal is renamed", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "daily" };
    h.container.resolve(StartupOpenService);

    h.repo.rename("daily", "work");

    expect(h.settings.getSlice(startupSlice).state.journalName).toBe("work");
  });

  it("clears the stored journal name when that journal is deleted", async () => {
    const h = build({ daily: fixedJournal("daily", { type: "day" }) });
    await h.settings.initialize();
    h.settings.getSlice(startupSlice).state = { journalName: "daily" };
    h.container.resolve(StartupOpenService);

    h.repo.delete("daily");

    expect(h.settings.getSlice(startupSlice).state.journalName).toBe("");
  });
});
