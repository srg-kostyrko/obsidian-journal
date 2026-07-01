import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
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

import TemplateStringPreview from "./TemplateStringPreview.vue";

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
      version: 4,
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
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  return container;
}

function mount(container: Container, props: { journalName: string; value: string; label: string }) {
  return render(TemplateStringPreview, {
    props,
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

describe("TemplateStringPreview", () => {
  it("renders the resolved value when it contains a variable", async () => {
    const container = await setupDaily("{{date:YYYY}}/journal");
    mount(container, { journalName: "daily", value: "{{date:YYYY}}/journal", label: "Preview:" });
    expect(screen.getByText("2026/journal")).toBeTruthy();
    expect(screen.getByText("Preview:")).toBeTruthy();
  });

  it("does not render when the value has no variables", async () => {
    const container = await setupDaily("static/folder");
    const { container: dom } = mount(container, { journalName: "daily", value: "static/folder", label: "Preview:" });
    expect(dom.textContent ?? "").toBe("");
  });
});
