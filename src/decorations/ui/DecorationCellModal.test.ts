import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { DayPeriod, WeekPeriod } from "@/calendar";
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

import DecorationCellModal from "./DecorationCellModal.vue";

import type { BreakdownEntry } from "./breakdown-entry";

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
  notes?: readonly Note[];
  entry: BreakdownEntry;
  shelf?: string | null;
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

async function mount(options: MountOptions): Promise<{ harness: TestHarness }> {
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

  harness.render(DecorationCellModal, { props: { entry: options.entry, shelf: options.shelf } });

  return { harness };
}

const anyDayDecoration: JournalDecoration = buildDecoration({
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

const anyDayCalendarDecoration: CalendarDecoration = buildCalendarDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

describe("DecorationCellModal", () => {
  it("renders only the clicked cell when the date also belongs to a decorated week cell", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    await mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [hasNoteDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [anyDayDecoration] }),
      },
      notes: [{ journalName: "daily", anchor: day }],
      entry: { kind: "fixed", period: day },
    });

    expect(screen.getByText(m.decoration_breakdown_cell_heading({ kind: "day", label: "2026-05-25" }))).toBeTruthy();
    expect(screen.getAllByTestId("decoration-preview")).toHaveLength(1);
  });

  it("resolves a week entry against the week cell", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const week = WeekPeriod.containing(date("2026-05-25"));
    await mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [hasNoteDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [anyDayDecoration] }),
      },
      notes: [{ journalName: "daily", anchor: day }],
      entry: { kind: "fixed", period: week },
    });

    expect(screen.getByText(m.decoration_breakdown_owner({ kind: "journal", name: "weekly" }))).toBeTruthy();
  });

  it("resolves an interval entry against the interval's own decorations", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    await mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [hasNoteDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
      entry: { kind: "interval", period: day, journalName: "sprint" },
    });

    // A non-offset custom decoration belongs to the interval, never to the day cell that
    // shares its anchor — the interval heading is what proves the right side was resolved.
    expect(
      screen.getByText(m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" })),
    ).toBeTruthy();
  });

  it("resolves a day entry against the day cell when that day starts an interval", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    await mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [anyDayDecoration] }),
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [hasNoteDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
      entry: { kind: "fixed", period: day },
    });

    expect(screen.getByText(m.decoration_breakdown_cell_heading({ kind: "day", label: "2026-05-25" }))).toBeTruthy();
    expect(
      screen.queryByText(m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" })),
    ).toBeNull();
  });

  it("resolves against the shelf it was opened under", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    await mount({
      shelves: { work: buildShelf("work"), home: buildShelf("home", { decorations: [anyDayCalendarDecoration] }) },
      entry: { kind: "fixed", period: day },
      shelf: "work",
    });

    expect(screen.getByText(m.decoration_breakdown_cell_empty())).toBeTruthy();
  });

  it("re-resolves when the shelf selection changes", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    await mount({
      shelves: { work: buildShelf("work"), home: buildShelf("home", { decorations: [anyDayCalendarDecoration] }) },
      entry: { kind: "fixed", period: day },
      shelf: "home",
    });

    expect(screen.getByTestId("decoration-preview")).toBeTruthy();

    await userEvent.selectOptions(screen.getByRole("combobox"), "work");

    expect(screen.getByText(m.decoration_breakdown_cell_empty())).toBeTruthy();
  });

  it("shows a note-size decoration once its size lands", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    await mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [noteSizeDecoration] }),
      },
      // 400 "word"s clears the condition's gt:100 threshold once NoteSizeService reads it.
      notes: [{ journalName: "daily", anchor: day, content: "word ".repeat(400) }],
      entry: { kind: "fixed", period: day },
    });

    expect(screen.getByText(m.decoration_breakdown_cell_empty())).toBeTruthy();

    await settle();

    expect(screen.getByTestId("decoration-preview")).toBeTruthy();
  });
});
