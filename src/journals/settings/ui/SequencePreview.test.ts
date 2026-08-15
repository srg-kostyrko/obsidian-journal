import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar, type AnchorString } from "@/calendar";
import { installTestCalendar, testCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
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
  const rendered = render(SequencePreview, {
    props: { journalName: "daily" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { ...rendered, journalsIndex: container.resolve(JournalsIndex) };
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

  it("renders nothing when numbering has no digits", async () => {
    const { container } = mount({
      numbering: { enabled: true, anchorDate: "" as AnchorString, allowBefore: false, sources: [] },
    });

    await waitFor(() => {
      expect(container.querySelector(".sequence-preview")).toBeNull();
    });
  });

  it("re-renders when the index gains a stored end date for an already-rendered anchor", async () => {
    const { journalsIndex } = mount({
      write: { type: "custom", every: "week", duration: 2, anchorDate: "2026-01-05" as AnchorString },
      nameTemplate: "Note{{end_date}}",
      numbering: {
        enabled: true,
        anchorDate: "2026-01-05" as AnchorString,
        allowBefore: false,
        sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
      },
    });

    // With no stored entry, today's period's end date is the cycle's default: two weeks
    // from the 2026-01-05 anchor, minus a day.
    expect(await screen.findByText("Note2026-01-18")).toBeTruthy();

    // Registering a stored end date for that same anchor is the only way JournalsIndex
    // changes without a reactive config edit — it must flow through useIndexVersion's
    // entryChanged bridge, not through Vue's own reactivity, for the preview to notice.
    journalsIndex.register({
      journalName: "daily",
      anchor: "2026-01-05" as AnchorString,
      path: "daily/2026-01-05.md" as VaultPath,
      endDate: "2026-01-10" as AnchorString,
    });

    await waitFor(() => {
      expect(screen.getByText("Note2026-01-10")).toBeTruthy();
    });
    expect(screen.queryByText("Note2026-01-18")).toBeNull();
  });
});
