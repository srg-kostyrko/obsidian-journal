import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
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
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { createSettingsService } from "@/settings/testing";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import TemplatePathPreview from "./TemplatePathPreview.vue";

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

async function setupDaily() {
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
          folder: "",
          templates: ["templates/{{date:YYYY}}-daily.md"],
          confirmCreation: false,
          autoCreate: false,
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

describe("TemplatePathPreview", () => {
  it("renders the resolved template path when it contains a variable", async () => {
    const container = await setupDaily();
    render(TemplatePathPreview, {
      props: { journalName: "daily", path: "templates/{{date:YYYY}}-daily.md" },
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
    expect(screen.getByText("templates/2026-daily.md")).toBeTruthy();
  });

  it("does not render when path has no variables", async () => {
    const container = await setupDaily();
    const { container: dom } = render(TemplatePathPreview, {
      props: { journalName: "daily", path: "templates/daily.md" },
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
