import userEvent from "@testing-library/user-event";
import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestCalendar, anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../../cycle";
import { FrontmatterService } from "../../frontmatter";
import { JournalsIndex } from "../../journals-index";
import { NumberingService } from "../../numbering";
import { JournalsRepository } from "../../repository";
import { fakeRepo, fixedJournal } from "../../testing";
import { TimelineService } from "../../timeline";
import { NotePathService } from "../note-path";

import ConnectNoteModal from "./ConnectNoteModal.vue";

import type { ConnectNoteResult } from "./modals";

function buildContainer(repo: JournalsRepository): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(repo);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  return c;
}

function mountModal(path: VaultPath, container: Container, api: ModalApi<ConnectNoteResult>) {
  return render(ConnectNoteModal, {
    props: { path },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api as unknown as ModalApi<unknown>);
          },
        },
      ],
    },
  });
}

describe("ConnectNoteModal", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });

  afterEach(() => {
    teardown();
    cleanup();
  });

  describe("when the note is already connected to a journal", () => {
    it("offers Disconnect when the note is already connected", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const container = buildContainer(repo);
      const index = container.resolve(JournalsIndex);
      index.register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "Journal/2026-06-01.md" as VaultPath,
      });

      const submit = vi.fn();
      const cancel = vi.fn();
      const api: ModalApi<ConnectNoteResult> = { submit, cancel };

      mountModal("Journal/2026-06-01.md" as VaultPath, container, api);
      await userEvent.click(screen.getByText(m.connect_note_modal_disconnect()));
      expect(submit).toHaveBeenCalledWith({ action: "disconnect", journalName: "daily" });
    });

    it("does not render the journal select when the note is connected", () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const container = buildContainer(repo);
      const index = container.resolve(JournalsIndex);
      index.register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "Journal/2026-06-01.md" as VaultPath,
      });

      const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

      mountModal("Journal/2026-06-01.md" as VaultPath, container, api);
      expect(screen.queryByRole("combobox")).toBeNull();
    });
  });

  describe("when the vault has no journals", () => {
    it("says so and points at the settings instead of offering a dead form", () => {
      const container = buildContainer(fakeRepo({}));
      const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

      mountModal("inbox/note.md" as VaultPath, container, api);
      expect(screen.getByText(m.common_no_journals_yet())).toBeTruthy();
    });

    it("offers no journal select to choose from", () => {
      const container = buildContainer(fakeRepo({}));
      const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

      mountModal("inbox/note.md" as VaultPath, container, api);
      expect(screen.queryByRole("combobox")).toBeNull();
    });
  });

  describe("when the note is not connected", () => {
    it("shows the note path", () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const container = buildContainer(repo);
      const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

      mountModal("inbox/note.md" as VaultPath, container, api);
      expect(screen.getByText("inbox/note.md")).toBeTruthy();
    });

    it("submits a connect command for an unconnected note", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const container = buildContainer(repo);

      const submit = vi.fn();
      const cancel = vi.fn();
      const api: ModalApi<ConnectNoteResult> = { submit, cancel };

      mountModal("inbox/note.md" as VaultPath, container, api);
      await userEvent.click(screen.getByText(m.connect_note_modal_connect()));
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ action: "connect", journalName: "daily" }));
    });

    it("disables Connect when the chosen date is outside the journal timeline", async () => {
      const repo = fakeRepo({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: anchor(""), end: { kind: "date", date: anchor("2026-06-01") } } },
        ),
      });
      const container = buildContainer(repo);
      const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

      mountModal("inbox/note.md" as VaultPath, container, api);
      await fireEvent.update(screen.getByLabelText(m.connect_note_modal_date_label()), "2026-09-15");

      const connect = screen.getByRole("button", { name: m.connect_note_modal_connect() });
      expect((connect as HTMLButtonElement).disabled).toBe(true);
    });

    it("explains that the chosen date is outside the journal timeline", async () => {
      const repo = fakeRepo({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: anchor(""), end: { kind: "date", date: anchor("2026-06-01") } } },
        ),
      });
      const container = buildContainer(repo);
      const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

      mountModal("inbox/note.md" as VaultPath, container, api);
      await fireEvent.update(screen.getByLabelText(m.connect_note_modal_date_label()), "2026-09-15");

      expect(screen.getByText(m.connect_note_modal_out_of_bounds())).toBeTruthy();
    });

    it("spells out the current and configured folder on the move toggle", () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { folder: "journals" }) });
      const container = buildContainer(repo);
      const api: ModalApi<ConnectNoteResult> = { submit: vi.fn(), cancel: vi.fn() };

      mountModal("inbox/note.md" as VaultPath, container, api);
      expect(
        screen.getByText(m.connect_note_modal_move_description({ current: "inbox", configured: "journals" })),
      ).toBeTruthy();
    });
  });
});
