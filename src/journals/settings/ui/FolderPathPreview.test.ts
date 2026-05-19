import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { provideInjectorOnApp } from "@/infrastructure/di";
import {
  CycleService,
  FrontmatterService,
  JournalsIndex,
  NotePathService,
  NumberingService,
  journalConfigCollection,
} from "@/journals";
import { createSettingsService } from "@/settings/testing";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import FolderPathPreview from "./FolderPathPreview.vue";

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

async function setupDaily(folder: string) {
  const { service, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: {
      version: 3,
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
          folder,
          templates: [],
          confirmCreation: false,
          autoCreate: false,
        },
      },
    },
  });
  await service.initialize();
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  return container;
}

describe("FolderPathPreview", () => {
  it("renders the resolved folder when it contains a variable", async () => {
    const container = await setupDaily("{{date:YYYY}}/journal");
    render(FolderPathPreview, {
      props: { journalName: "daily", folder: "{{date:YYYY}}/journal" },
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
    expect(screen.getByText("2026/journal")).toBeTruthy();
  });

  it("does not render when folder has no variables", async () => {
    const container = await setupDaily("static/folder");
    const { container: dom } = render(FolderPathPreview, {
      props: { journalName: "daily", folder: "static/folder" },
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
    expect(dom.textContent ?? "").toBe("");
  });
});
