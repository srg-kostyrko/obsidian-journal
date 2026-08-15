import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar, type AnchorString } from "@/calendar";
import { installTestCalendar, testCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
import {
  CycleService,
  FrontmatterService,
  JournalsRepository,
  JournalsViewModel,
  NotePathService,
  NumberingService,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { JournalsIndex } from "@/journals/journals-index";
import { JournalsEventsToken } from "@/journals/tokens";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import SequencePreview from "./SequencePreview.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-05T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
  teardown();
  cleanup();
});

function mount(overrides: Partial<JournalConfig> = {}) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({
    daily: { ...journalDefaultsFor({ type: "day" }, "daily"), ...overrides },
  });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  container.addModule(createLoggerTestingModule().module);
  container.register(JournalsEventsToken).useValue(events);
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(Calendar).useValue(testCalendar());
  return render(SequencePreview, {
    props: { journalName: "daily" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("SequencePreview", () => {
  it("renders the next five note names for a two-digit journal", async () => {
    mount({
      write: { type: "custom", every: "week", duration: 2, anchorDate: "2026-01-05" as AnchorString },
      nameTemplate: "Release{{release}}Sprint{{sprint}}",
      numbering: {
        enabled: true,
        anchorDate: "2026-01-05" as AnchorString,
        allowBefore: false,
        sources: [
          { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
          {
            variable: "sprint",
            frontmatterKey: "journal-sprint",
            anchorValue: 1,
            reset: { kind: "after", count: 6 },
          },
        ],
      },
    });

    // System time is pinned to 2026-01-05 in beforeEach, so today's period is the anchor.
    expect(await screen.findByText("Release4711Sprint1")).toBeTruthy();
    expect(screen.getByText("Release4711Sprint5")).toBeTruthy();
    expect(screen.queryByText("Release4711Sprint6")).toBeNull();
  });

  it("renders nothing when the journal has no resolvable anchor", async () => {
    const { container } = mount({
      numbering: { enabled: true, anchorDate: "" as AnchorString, allowBefore: false, sources: [] },
    });

    await waitFor(() => {
      expect(container.querySelector(".sequence-preview")).toBeNull();
    });
  });
});
