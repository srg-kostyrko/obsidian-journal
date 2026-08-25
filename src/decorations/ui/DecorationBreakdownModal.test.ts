import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DayPeriod, type AnchorString } from "@/calendar";
import { date } from "@/calendar/testing";
import type { CalendarDecoration, JournalDecoration } from "@/decorations";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import type { ShelfConfig } from "@/shelves/config";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer, type TestHarness } from "@/testing";

import { decorationsModule } from "../module";
import { decorationsSettingsCoreModule } from "../settings/module";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "../testing";

import DecorationBreakdownModal from "./DecorationBreakdownModal.vue";

interface Note {
  readonly journalName: string;
  readonly anchor: DayPeriod;
  // Empty by default: has-note/title conditions only need the file to exist. The note-size
  // test overrides this so the real NoteSizeService's async fill (triggered by the modal's
  // own first read) has a size to land on.
  readonly content?: string;
}

interface MountOptions {
  journals?: Record<string, JournalConfig>;
  shelves?: Record<string, ShelfConfig>;
  globalDecorations?: readonly CalendarDecoration[];
  shelf?: string | null;
  // Registered into JournalsIndex before render, so has-note conditions resolve on the very
  // first computed read — JournalsIndex is event-based rather than Vue-reactive, so seeding it
  // after mount would need a manual re-trigger instead of just asserting the rendered output.
  notes?: readonly Note[];
}

// NoteSizeService.get() schedules its own async fill on a miss (note-size-service.ts's
// #fill), and DecorationEngine.explainRange's first read during mount already triggers that
// fill for any note-size condition in scope, so waiting out the promise chain is enough —
// the same pattern note-size-service.test.ts's own `settle` uses. Measured: no
// FakeNoteSizeService or manual vault event is needed; see the report for the evidence this
// corrects an earlier ruling that assumed the real service could not be driven deterministically.
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function mount(options: MountOptions = {}): Promise<{ harness: TestHarness }> {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule],
    data: {
      journals: options.journals ?? {},
      shelves: options.shelves ?? {},
      decorations: { decorations: [...(options.globalDecorations ?? [])] },
    },
  });

  const index = harness.resolve(JournalsIndex);
  const notes = options.notes ?? [];
  for (const note of notes) {
    const path = `${note.journalName}/${note.anchor.anchor.toAnchor()}.md` as VaultPath;
    harness.host.putFile(path, note.content ?? "");
    index.register({ journalName: note.journalName, anchor: note.anchor.anchor.toAnchor(), path });
  }

  harness.render(DecorationBreakdownModal, { props: { shelf: options.shelf } });

  return { harness };
}

const anyDayDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

const anyDayCalendarDecoration: CalendarDecoration = buildCalendarDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

const hasNoteDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("has-note")],
  styles: [buildStyle("background")],
});

const noteSizeDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("note-size", { condition: "gt", value: 100 })],
  styles: [buildStyle("background")],
});

describe("DecorationBreakdownModal", () => {
  beforeEach(() => {
    // The explorer defaults its anchor to CalendarDate.today(), so the fixtures' custom-journal
    // intervals (anchored at 2026-05-25) need the system clock pinned there to stay date-stable.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-25T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a section for each decorated cell the date belongs to", async () => {
    await mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [anyDayDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [anyDayDecoration] }),
      },
    });

    expect(screen.getAllByTestId("decoration-preview")).toHaveLength(2);
  });

  it("omits a cell no decoration matched", async () => {
    await mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [anyDayDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [] }),
      },
    });

    expect(screen.getAllByTestId("decoration-preview")).toHaveLength(1);
  });

  it("admits a custom journal's offset decoration to the day cell", async () => {
    const offsetDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("offset", { offset: 1 })],
      styles: [buildStyle("background")],
    });
    await mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [offsetDecoration] }),
      },
    });

    expect(screen.getByText(m.decoration_condition_offset_describe({ side: "start", day: 1 }))).toBeTruthy();
  });

  it("excludes a custom journal's non-offset decoration from the day cell", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const nonOffsetDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note")],
      styles: [buildStyle("background")],
    });
    await mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [nonOffsetDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
    });

    // The day cell gets zero contributions once the offset-only filter excludes this
    // decoration, so no day section renders. It still surfaces in the interval section below.
    expect(screen.queryByText(m.decoration_breakdown_cell_heading({ kind: "day", label: "2026-05-25" }))).toBeNull();
  });

  it("shows an interval section for a custom journal's non-offset decoration", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    await mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [hasNoteDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
    });

    const heading = screen.getByText(
      m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" }),
    );
    const region = heading.closest('[role="region"]');
    expect(region).not.toBeNull();
    expect(within(region as HTMLElement).getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });

  it("keeps a custom journal's offset decoration out of the interval section", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const offsetDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("offset", { offset: 1 })],
      styles: [buildStyle("background")],
    });
    await mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", {
          decorations: [hasNoteDecoration, offsetDecoration],
        }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
    });

    const heading = screen.getByText(
      m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" }),
    );
    const region = heading.closest('[role="region"]');
    expect(region).not.toBeNull();
    expect(
      within(region as HTMLElement).queryByText(m.decoration_condition_offset_describe({ side: "start", day: 1 })),
    ).toBeNull();
  });

  it("omits an interval section for a journal whose timeline excludes the interval", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    await mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", {
          decorations: [hasNoteDecoration],
          timeline: { start: "2026-07-01" as AnchorString, end: { kind: "never" } },
        }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
    });

    expect(
      screen.queryByText(m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" })),
    ).toBeNull();
  });

  it("re-resolves when the shelf selection changes", async () => {
    await mount({
      shelves: {
        work: buildShelf("work"),
        home: buildShelf("home", { decorations: [anyDayCalendarDecoration] }),
      },
    });

    // "All journals" unions every shelf's list, so narrowing to a shelf that owns none drops it.
    expect(screen.getByTestId("decoration-preview")).toBeTruthy();

    await userEvent.selectOptions(screen.getByRole("combobox"), "work");

    expect(screen.getByText(m.decoration_breakdown_empty())).toBeTruthy();
  });

  it("resolves against the shelf it was opened under", async () => {
    await mount({
      shelves: {
        work: buildShelf("work"),
        home: buildShelf("home", { decorations: [anyDayCalendarDecoration] }),
      },
      shelf: "work",
    });

    expect(screen.getByText(m.decoration_breakdown_empty())).toBeTruthy();

    // Widening to all journals unions every shelf, so home's rule surfaces — proving the
    // empty state above came from the seeded scope and not from an unpopulated fixture.
    await userEvent.selectOptions(screen.getByRole("combobox"), "");

    expect(screen.getByTestId("decoration-preview")).toBeTruthy();
  });

  it("shows the empty state for a date nothing decorates", async () => {
    await mount({});

    expect(screen.getByText(m.decoration_breakdown_empty())).toBeTruthy();
  });

  it("shows a note-size decoration once its size lands", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    await mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [noteSizeDecoration] }),
      },
      // 400 "word"s clears the condition's gt:100 threshold once NoteSizeService reads it.
      notes: [{ journalName: "daily", anchor: day, content: "word ".repeat(400) }],
    });

    expect(screen.getByText(m.decoration_breakdown_empty())).toBeTruthy();

    await settle();

    expect(screen.getByTestId("decoration-preview")).toBeTruthy();
  });
});
