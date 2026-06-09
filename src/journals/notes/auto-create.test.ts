import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { fakeRepo, fixedJournal } from "../testing";

import { AutoCreateService } from "./auto-create";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { SelfWriteGuard } from "./self-write-guard";
import { TemplateContentService } from "./template-content";

function build(repo: JournalsRepository, notes: FakeNotesService): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(repo);
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
  c.register(AutoCreateService).useClass(AutoCreateService);
  return c;
}

describe("AutoCreateService", () => {
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

  it("creates today's note for journals with autoCreate=true", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { autoCreate: true }),
      monthly: fixedJournal("monthly", { type: "month" }, { autoCreate: false }),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    await container.resolve(AutoCreateService).initialize();
    await vi.advanceTimersByTimeAsync(0);
    expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
    expect(notes.find("2026-05.md" as VaultPath).isNone()).toBe(true);
  });

  it("re-ticks at the next local midnight", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { autoCreate: true }) });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    await container.resolve(AutoCreateService).initialize();
    await vi.advanceTimersByTimeAsync(0);
    expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
    await vi.advanceTimersByTimeAsync(15 * 60 * 60 * 1000);
    expect(notes.find("2026-05-20.md" as VaultPath).isSome()).toBe(true);
  });

  it("stops ticking after dispose", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { autoCreate: true }) });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    const service = container.resolve(AutoCreateService);
    await service.initialize();
    await service[Symbol.asyncDispose]();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
    expect(notes.find("2026-05-20.md" as VaultPath).isNone()).toBe(true);
  });

  it("isolates errors per-journal — one failing journal does not stop others", async () => {
    const repo = fakeRepo({
      a: fixedJournal("a", { type: "day" }, { autoCreate: true, folder: "A" }),
      b: fixedJournal("b", { type: "day" }, { autoCreate: true, folder: "B" }),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    const creation = container.resolve(NoteCreationService);
    vi.spyOn(creation, "ensureNote").mockImplementationOnce(() =>
      AsyncResult.err(new Error("forced failure") as never),
    );
    await container.resolve(AutoCreateService).initialize();
    await vi.advanceTimersByTimeAsync(0);
    const aExists = notes.find("A/2026-05-19.md" as VaultPath).isSome();
    const bExists = notes.find("B/2026-05-19.md" as VaultPath).isSome();
    expect(aExists || bExists).toBe(true);
    expect(aExists && bExists).toBe(false);
  });
});
