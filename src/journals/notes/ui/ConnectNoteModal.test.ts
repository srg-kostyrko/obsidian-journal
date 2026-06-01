import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
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
import { NotePathService } from "../note-path";

import ConnectNoteModal from "./ConnectNoteModal.vue";

import type { ConnectNoteResult } from "./modals";

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
      expect(submit).toHaveBeenCalledWith({ action: "disconnect" });
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

  describe("when the note is not connected", () => {
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
  });
});
