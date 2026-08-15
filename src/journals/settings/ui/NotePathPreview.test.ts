import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { provideInjectorOnApp, type Container } from "@/infrastructure/di";
import {
  CycleService,
  FrontmatterService,
  journalConfigCollection,
  JournalsIndex,
  NotePathService,
  NumberingService,
} from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { createSettingsService } from "@/settings/testing";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import NotePathPreview from "./NotePathPreview.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
  teardown();
  cleanup();
});

async function setupDaily(overrides: { nameTemplate?: string; folder?: string } = {}) {
  const { service, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: {
      version: 5,
      journals: {
        daily: {
          name: "daily",
          write: { type: "day" },
          timeline: { start: "2026-01-01", end: { kind: "never" } },
          dateFormat: "YYYY-MM-DD",
          frontmatter: {
            dateField: "journal-date",
            startDateField: "journal-start-date",
            endDateField: "journal-end-date",
            addStartDate: false,
            addEndDate: false,
          },
          numbering: { enabled: false, anchorDate: "2026-01-01", allowBefore: false, sources: [] },
          nameTemplate: "{{date}}",
          folder: "",
          templates: [],
          confirmCreation: false,
          autoCreate: false,
          ...overrides,
        },
      },
    },
  });
  await service.initialize();
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  return container;
}

function renderPreview(container: Container, journalName: string) {
  return render(NotePathPreview, {
    props: { journalName },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

describe("NotePathPreview", () => {
  it("renders today's resolved path for a journal with no folder", async () => {
    const container = await setupDaily();
    renderPreview(container, "daily");
    expect(screen.getByText("2026-05-19.md")).toBeTruthy();
  });

  it("prefixes the resolved note name with the resolved folder", async () => {
    const container = await setupDaily({ folder: "Journals/{{date:YYYY}}" });
    renderPreview(container, "daily");
    expect(screen.getByText("Journals/2026/2026-05-19.md")).toBeTruthy();
  });

  it("resolves a folder that consumes the rendered note name", async () => {
    const container = await setupDaily({ folder: "Journals/{{note_name}}" });
    renderPreview(container, "daily");
    expect(screen.getByText("Journals/2026-05-19/2026-05-19.md")).toBeTruthy();
  });

  it("updates reactively when the journal's nameTemplate changes", async () => {
    const container = await setupDaily();
    renderPreview(container, "daily");
    container.resolve(JournalsRepository).update("daily", { nameTemplate: "note-{{date}}" });
    await waitFor(() => {
      expect(screen.getByText("note-2026-05-19.md")).toBeTruthy();
    });
  });

  it("updates reactively when the journal's folder changes", async () => {
    const container = await setupDaily();
    renderPreview(container, "daily");
    container.resolve(JournalsRepository).update("daily", { folder: "Diary" });
    await waitFor(() => {
      expect(screen.getByText("Diary/2026-05-19.md")).toBeTruthy();
    });
  });

  it("warns when the name template resolves to an empty note name", async () => {
    const container = await setupDaily({ nameTemplate: "" });
    renderPreview(container, "daily");
    expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
  });

  it("warns when the name template renders only whitespace", async () => {
    const container = await setupDaily({ nameTemplate: " ".repeat(3) });
    renderPreview(container, "daily");
    expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
  });

  it("renders nothing when the journal no longer exists", async () => {
    const container = await setupDaily();
    const { container: dom } = renderPreview(container, "ghost");
    expect(dom.textContent ?? "").toBe("");
  });
});
