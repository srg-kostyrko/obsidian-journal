import { describe, expect, it, vi } from "vitest";

import { DayPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SuggestService, WorkspaceService, NoticeService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeSuggestService } from "@/infrastructure/host/suggests/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { Ok } from "@/infrastructure/result";

import { JournalsRepository } from "../../repository";
import { fakeRepo, fixedJournal } from "../../testing";
import { NotePathService } from "../note-path";

import { InsertJournalLinkFlow } from "./insert-journal-link.flow";

import type { JournalConfig } from "../../config";

function build(journals: Record<string, JournalConfig>) {
  installTestCalendar();
  const c = new Container();
  c.addModule(LoggerModule);
  const modals = new FakeModalService();
  const suggests = new FakeSuggestService();
  const workspace = { insertNoteLinkAtCursor: vi.fn(() => true) };
  const path = { pathForDate: vi.fn(() => new Ok("Journals/2026-01-01.md" as VaultPath)) };

  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(SuggestService).useValue(suggests as unknown as SuggestService);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(NotePathService).useValue(path as unknown as NotePathService);
  c.register(NoticeService).useValue(new FakeNoticeService());
  c.register(Flows).useClass(Flows);
  c.register(InsertJournalLinkFlow).useClass(InsertJournalLinkFlow);
  return { flows: c.resolve(Flows), modals, suggests, workspace, path };
}

const tick = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

describe("InsertJournalLinkFlow", () => {
  it("inserts a link to the picked date's note path when a single journal exists", async () => {
    const { flows, modals, workspace } = build({ daily: fixedJournal("daily", { type: "day" }) });
    const promise = flows.invoke(InsertJournalLinkFlow);
    await tick();
    modals.lastOpen().submit(DayPeriod.containing(date("2026-01-01")));
    await promise;
    expect(workspace.insertNoteLinkAtCursor).toHaveBeenCalledWith("Journals/2026-01-01.md");
  });

  it("prompts for a journal before the date when more than one exists", async () => {
    const { flows, suggests, modals, path } = build({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
    });
    const promise = flows.invoke(InsertJournalLinkFlow);
    await tick();
    suggests.lastOpen().choose("weekly");
    await tick();
    modals.lastOpen().submit(DayPeriod.containing(date("2026-01-01")));
    await promise;
    expect(path.pathForDate).toHaveBeenCalledWith("weekly", expect.anything());
  });

  it("does not insert when the journal picker is cancelled", async () => {
    const { flows, suggests, workspace } = build({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
    });
    const promise = flows.invoke(InsertJournalLinkFlow);
    await tick();
    suggests.lastOpen().cancel();
    await promise;
    expect(workspace.insertNoteLinkAtCursor).not.toHaveBeenCalled();
  });

  it("does not insert when the date picker is cancelled", async () => {
    const { flows, modals, workspace } = build({ daily: fixedJournal("daily", { type: "day" }) });
    const promise = flows.invoke(InsertJournalLinkFlow);
    await tick();
    modals.lastOpen().cancel();
    await promise;
    expect(workspace.insertNoteLinkAtCursor).not.toHaveBeenCalled();
  });
});
