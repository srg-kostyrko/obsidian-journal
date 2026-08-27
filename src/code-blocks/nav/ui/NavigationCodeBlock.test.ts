import userEvent from "@testing-library/user-event";
import { fireEvent, screen } from "@testing-library/vue";
import { __testing } from "obsidian";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { anchor } from "@/calendar/testing";
import type { CalendarDecoration, JournalDecoration } from "@/decorations";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { initLocale, m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceOpenError, WorkspaceService, type VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import {
  JournalsIndex,
  OpenDateFlow,
  type JournalConfig,
  type JournalEntry,
  type JournalNavBlock,
  type NavBlockSegment,
} from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { buildNavSegment, customJournal, fixedJournal } from "@/journals/testing";
import type { ShelfConfig } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer, type TestHarness } from "@/testing";

import NavigationCodeBlock from "./NavigationCodeBlock.vue";

// Every segment in this suite was authored transparent, predating buildNavSegment's
// theme-colored default; nothing here asserts on color, so this only keeps the fixtures
// equal to what they proved before.
const transparent = { type: "transparent" } as const;

interface NavScenario {
  readonly journals: Record<string, JournalConfig>;
  readonly shelves?: Record<string, ShelfConfig>;
  readonly calendarDecorations?: readonly CalendarDecoration[];
  /** Registered on the live index before mount. Register after mount to exercise a reactivity guard. */
  readonly entries?: readonly JournalEntry[];
  /** Notes that must exist in the vault for a real open or file menu to resolve. */
  readonly notes?: readonly string[];
}

async function renderNav(path: string, scenario: NavScenario) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule],
    data: {
      journals: scenario.journals,
      shelves: scenario.shelves ?? {},
      decorations: { decorations: scenario.calendarDecorations ?? [] },
    },
  });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  const index = harness.resolve(JournalsIndex);
  const entries = scenario.entries ?? [];
  const notes = scenario.notes ?? [];
  for (const entry of entries) index.register(entry);
  for (const note of notes) harness.host.putFile(note);
  harness.render(NavigationCodeBlock, { props: { path: path as VaultPath, config: {} } });
  return { harness, flows, index, workspace: harness.resolve(WorkspaceService) };
}

function journalEntry(journalName: string, anchorDate: string, path: string): JournalEntry {
  return { journalName, anchor: anchor(anchorDate), path: path as VaultPath };
}

function cornerDecoration(): JournalDecoration {
  return buildDecoration({
    conditions: [buildCondition("date")],
    styles: [buildStyle("corner", { placement: "top-left" })],
  });
}

function dailyWithNavBlock(navBlock: Partial<JournalNavBlock>, overrides: Partial<JournalConfig> = {}): JournalConfig {
  const base = fixedJournal("daily", { type: "day" }, overrides);
  return { ...base, navBlock: { ...base.navBlock, ...navBlock } };
}

function yearlyWithLines(lines: NavBlockSegment[][]): JournalConfig {
  const base = fixedJournal("yearly", { type: "year" });
  return { ...base, navBlock: { ...base.navBlock, lines } };
}

async function renderYearlyNav(
  lines: NavBlockSegment[][],
  extra: Record<string, JournalConfig> = {},
  shelves?: Record<string, ShelfConfig>,
) {
  return renderNav("Yearly/2025.md", {
    journals: { yearly: yearlyWithLines(lines), ...extra },
    shelves,
    entries: [journalEntry("yearly", "2025-01-01", "Yearly/2025.md")],
  });
}

function renderNavWithSegment(overrides: Partial<NavBlockSegment>) {
  return renderYearlyNav(
    [[buildNavSegment({ template: "today", color: transparent, ...overrides })]],
    { quarterly: fixedJournal("quarterly", { type: "quarter" }) },
    { main: buildShelf("main", { journals: ["yearly", "quarterly"] }) },
  );
}

function registerQuarterlyNote(index: JournalsIndex): void {
  index.register(journalEntry("quarterly", "2025-04-01", "Quarterly/2025-Q2.md"));
}

// The real WorkspaceService drives Obsidian's own Menu, so the assertions below read the
// menu the host actually opened. `undefined` and `[]` are different outcomes and must stay
// distinguishable: openPathsMenu returns without showing anything when a segment resolved
// neither a path nor an extra item, whereas a shown menu carrying no items would be a bug a
// `?? []` fallback would hide.
function menuItemTitles(): readonly string[] | undefined {
  return __testing.openMenus.at(-1)?.items.map((item) => item.title);
}

// openPathsMenu delegates a lone path to Obsidian's file menu, so the path it resolved shows
// up as the file the "file-menu" event carried rather than as a menu item title.
function fileMenuPaths(harness: TestHarness): readonly string[] {
  return harness.host.workspace.triggerCalls
    .filter((call) => call.event === "file-menu")
    .map((call) => (call.arguments_[1] as { path: string }).path);
}

function hoverPreviewPaths(harness: TestHarness): readonly string[] {
  return harness.host.workspace.triggerCalls
    .filter((call) => call.event === "link-hover")
    .map((call) => String(call.arguments_[2]));
}

beforeAll(() => initLocale("en"));

beforeEach(() => {
  __testing.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NavigationCodeBlock", () => {
  it("renders the not-connected message when the path has no journal entry", async () => {
    await renderNav("Random/Note.md", { journals: {} });
    expect(screen.getByText("Note is not connected to a journal")).toBeTruthy();
  });

  it("drops the not-connected message once the index registers the note after mount", async () => {
    const { index } = await renderNav("Daily/2026-05-27.md", {
      journals: { daily: fixedJournal("daily", { type: "day" }) },
    });

    index.register(journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md"));
    await nextTick();

    expect(screen.queryByText("Note is not connected to a journal")).toBeNull();
  });
});

describe("NavigationCodeBlock columns", () => {
  it("leaves the rendered block's segments free of the editor's drag and edit affordance", async () => {
    await renderYearlyNav([[buildNavSegment({ template: "static text", color: transparent })]]);
    expect(screen.getAllByText("static text").at(0)?.classList.contains("nav-row--editable")).toBe(false);
  });

  it("renders the current journal date in 'create' mode with prev/next periods from CycleService", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const dayNumbers = screen.getAllByText(/^(26|27|28)$/);
    expect(dayNumbers.map((element) => element.textContent).toSorted()).toEqual(["26", "27", "28"]);
  });

  it("renders empty side columns in 'existing' mode when there are no adjacent existing entries", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: { daily: dailyWithNavBlock({ type: "existing" }) },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    expect(screen.queryByText("26")).toBeNull();
    expect(screen.queryByText("28")).toBeNull();
    expect(screen.getByText("27")).toBeTruthy();
  });
});

describe("NavigationCodeBlock adjacent periods in 'existing' mode", () => {
  it("shows the previous period once the index registers its entry after mount", async () => {
    const { index } = await renderNav("Daily/2026-05-27.md", {
      journals: { daily: dailyWithNavBlock({ type: "existing" }) },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });
    expect(screen.queryByText("26")).toBeNull();

    index.register(journalEntry("daily", "2026-05-26", "Daily/2026-05-26.md"));
    await nextTick();

    expect(screen.getByText("26")).toBeTruthy();
  });
});

describe("NavigationCodeBlock segment templates", () => {
  it("renders note_name as the connected note's own name, and as the prospective name where no note exists", async () => {
    await renderNav("Daily/Renamed day.md", {
      journals: {
        daily: dailyWithNavBlock({ lines: [[buildNavSegment({ template: "{{note_name}}", color: transparent })]] }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/Renamed day.md")],
    });

    expect(screen.getByText("Renamed day")).toBeTruthy();
    expect(screen.getByText("2026-05-26")).toBeTruthy();
    expect(screen.getByText("2026-05-28")).toBeTruthy();
  });
});

describe("NavigationCodeBlock arrows", () => {
  it("invokes OpenDateFlow with the previous anchor and existingOnly=false in 'create' mode", async () => {
    const { flows } = await renderNav("Daily/2026-05-27.md", {
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /previous/i }));

    expect(flows.invoke).toHaveBeenCalledTimes(1);
    expect(flows.invoke).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ anchor: "2026-05-26", journalNames: ["daily"], existingOnly: false }),
    );
  });

  it("opens the previous entry in a new tab on a middle-click of the arrow", async () => {
    const { flows } = await renderNav("Daily/2026-05-27.md", {
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const arrow = screen.getByRole("button", { name: /previous/i });
    await fireEvent(arrow, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));

    expect(flows.invoke).toHaveBeenCalledTimes(1);
    expect(flows.invoke).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ openMode: "tab" }));
  });

  it("invokes OpenDateFlow with existingOnly=true in 'existing' mode", async () => {
    const { flows } = await renderNav("Daily/2026-05-27.md", {
      journals: { daily: dailyWithNavBlock({ type: "existing" }) },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [
        journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md"),
        journalEntry("daily", "2026-05-25", "Daily/2026-05-25.md"),
      ],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /previous/i }));

    expect(flows.invoke).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ existingOnly: true }));
  });
});

describe("NavigationCodeBlock segment click routing", () => {
  it("opens the current entry via WorkspaceService.openNote on a 'self' segment click", async () => {
    const { harness, flows } = await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "today", color: transparent, link: "self" })]],
        }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
      notes: ["Daily/2026-05-27.md"],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("today")[1];
    if (target) await user.click(target);
    expect(harness.host.workspace.openCalls.map((call) => call.path)).toEqual(["Daily/2026-05-27.md"]);
    expect(flows.invoke).toHaveBeenCalledTimes(0);
  });

  it("opens a segment's note directly once the index registers it", async () => {
    // Rows read the index for their own period, which is registered asynchronously — the
    // neighboring period's note lands after the block has already rendered.
    const { harness, index } = await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "{{date}}", color: transparent, link: "self" })]],
        }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
      notes: ["Daily/2026-05-27.md", "Daily/2026-05-28.md"],
    });

    index.register(journalEntry("daily", "2026-05-28", "Daily/2026-05-28.md"));
    await nextTick();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("2026-05-28"));

    expect(harness.host.workspace.openCalls.map((call) => call.path)).toEqual(["Daily/2026-05-28.md"]);
  });

  it("notifies when the current entry cannot be opened on a 'self' segment click", async () => {
    const { harness, workspace } = await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "today", color: transparent, link: "self" })]],
        }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
      // The note has to exist, or the real WorkspaceService fails on the missing file and the
      // injected error below stops being what this test proves.
      notes: ["Daily/2026-05-27.md"],
    });
    vi.spyOn(workspace, "openNote").mockReturnValueOnce(
      AsyncResult.err(new WorkspaceOpenError("Daily/2026-05-27.md" as VaultPath, "gone")),
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("today")[1];
    if (target) await user.click(target);
    await vi.waitFor(() => expect(harness.notices.messages).toContain(m.common_note_open_error()));
  });

  it("opens the current entry in a new tab on a middle-click of a 'self' segment", async () => {
    const { harness } = await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "today", color: transparent, link: "self" })]],
        }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
      notes: ["Daily/2026-05-27.md"],
    });

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent(target, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));

    expect(harness.host.workspace.openCalls).toHaveLength(1);
    expect(harness.host.workspace.openCalls[0]?.mode).toBe("tab");
  });

  it("opens the current entry in a split on a ctrl+alt click of a 'self' segment", async () => {
    const { harness } = await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "today", color: transparent, link: "self" })]],
        }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
      notes: ["Daily/2026-05-27.md"],
    });

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.click(target, { ctrlKey: true, altKey: true });

    expect(harness.host.workspace.openCalls).toHaveLength(1);
    expect(harness.host.workspace.openCalls[0]?.mode).toBe("split");
  });

  it("invokes OpenDateFlow with the segment's journal for link 'journal'", async () => {
    const { flows } = await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "go", color: transparent, link: "journal", journal: "weekly" })]],
        }),
        weekly: fixedJournal("weekly", { type: "week" }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily", "weekly"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("go")[0];
    if (target) await user.click(target);
    expect(flows.invoke).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ journalNames: ["weekly"] }));
  });

  it("invokes OpenDateFlow with all matching shelf journals for a period kind link", async () => {
    const { flows } = await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "wk", color: transparent, link: "week" })]],
        }),
        weekly1: fixedJournal("weekly1", { type: "week" }),
        weekly2: fixedJournal("weekly2", { type: "week" }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily", "weekly1", "weekly2"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("wk")[0];
    if (target) await user.click(target);
    expect(flows.invoke).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ journalNames: ["weekly1", "weekly2"] }),
    );
  });

  it("does nothing for a 'none' segment click", async () => {
    const { harness, flows } = await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "static", color: transparent })]],
        }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("static")[0];
    if (target) await user.click(target);
    expect(harness.host.workspace.openCalls).toHaveLength(0);
    expect(flows.invoke).toHaveBeenCalledTimes(0);
  });

  it("invokes OpenDateFlow with the shifted date for a segment carrying a linkDate", async () => {
    // yearly is anchored at 2025-01-01; the segment shows and opens Q2, not the plain Q1.
    const { flows } = await renderNavWithSegment({
      link: "quarter",
      linkDate: "+1q",
      template: "{{date+1q:[Q]Q}}",
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const target = screen.getAllByText("Q2")[1];
    if (target) await user.click(target);

    expect(flows.invoke).toHaveBeenCalledTimes(1);
    expect(flows.invoke).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ anchor: "2025-04-01", journalNames: ["quarterly"] }),
    );
  });

  it("resolves the shifted date's paths for the context menu", async () => {
    const { harness, index } = await renderNavWithSegment({
      link: "quarter",
      linkDate: "+1q",
      template: "{{date+1q:[Q]Q}}",
    });
    registerQuarterlyNote(index);
    harness.host.putFile("Quarterly/2025-Q2.md");

    const target = screen.getAllByText("Q2")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(fileMenuPaths(harness)).toEqual(["Quarterly/2025-Q2.md"]);
    // Obsidian's own delete entry and nothing ahead of it: extra items are prepended, so this
    // is the half that proves the segment contributed none.
    expect(menuItemTitles()).toEqual([m.common_action_delete()]);
  });

  it("previews the shifted date's note on modifier hover", async () => {
    const { harness, index } = await renderNavWithSegment({
      link: "quarter",
      linkDate: "+1q",
      template: "{{date+1q:[Q]Q}}",
    });
    registerQuarterlyNote(index);

    const target = screen.getAllByText("Q2")[1];
    if (target) await fireEvent.pointerEnter(target, { ctrlKey: true });

    expect(hoverPreviewPaths(harness)).toEqual(["Quarterly/2025-Q2.md"]);
  });
});

describe("NavigationCodeBlock context menu", () => {
  it("resolves the single matching path for openPathsMenu", async () => {
    const { harness } = await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "today", color: transparent, link: "self" })]],
        }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
      notes: ["Daily/2026-05-27.md"],
    });

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(fileMenuPaths(harness)).toEqual(["Daily/2026-05-27.md"]);
    expect(menuItemTitles()).toEqual([m.common_action_delete()]);
  });

  it("resolves every matching path for openPathsMenu when there are multiple", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "wk", color: transparent, link: "week" })]],
        }),
        weekly1: fixedJournal("weekly1", { type: "week" }),
        weekly2: fixedJournal("weekly2", { type: "week" }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily", "weekly1", "weekly2"] }) },
      entries: [
        journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md"),
        journalEntry("weekly1", "2026-05-27", "Weekly1/W22.md"),
        journalEntry("weekly2", "2026-05-27", "Weekly2/W22.md"),
      ],
    });

    const target = screen.getAllByText("wk")[1];
    if (target) await fireEvent.contextMenu(target);

    // Exactly the paths, in order: an extra item would be prepended, so this asserts both the
    // resolved paths and that the segment contributed none.
    expect(menuItemTitles()).toEqual(["Weekly1/W22.md", "Weekly2/W22.md"]);
  });

  it("contributes the explain item to the context menu of a decorated segment", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock(
          { lines: [[buildNavSegment({ template: "today", color: transparent, addDecorations: true })]] },
          { decorations: [cornerDecoration()] },
        ),
      },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(menuItemTitles()).toHaveLength(1);
  });

  // The per-segment decoration map is scoped to write-type, not to the segment's own addDecorations
  // flag (siblings need it to render their own matches), so the segment itself must filter: a segment
  // that opts out of showing a decoration should not offer to explain one it never renders.
  it("contributes no item to the context menu of a segment that opts out of decorations", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock(
          { lines: [[buildNavSegment({ template: "today", color: transparent, addDecorations: false })]] },
          { decorations: [cornerDecoration()] },
        ),
      },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(menuItemTitles()).toBeUndefined();
  });

  it("contributes no item to the context menu of an undecorated segment", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({ lines: [[buildNavSegment({ template: "today", color: transparent })]] }),
      },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.contextMenu(target);

    expect(menuItemTitles()).toBeUndefined();
  });

  it("opens an interval entry from a custom journal's segment", async () => {
    const sprint = customJournal("sprint", "week", 2, "2026-05-25", { decorations: [cornerDecoration()] });
    const { harness } = await renderNav("Sprint/2026-05-25.md", {
      journals: {
        sprint: {
          ...sprint,
          // "existing" mode avoids CycleService entirely for adjacent-period navigation, which no
          // note in this fixture supports — the fixture is not testing adjacent navigation, only
          // the segment's own context menu.
          navBlock: {
            ...sprint.navBlock,
            type: "existing",
            lines: [[buildNavSegment({ template: "sprint", color: transparent, addDecorations: true })]],
          },
        },
      },
      entries: [journalEntry("sprint", "2026-05-25", "Sprint/2026-05-25.md")],
    });

    // With no previous/next existing entries registered, only the current block renders,
    // so its segment is the sole "sprint" match.
    const target = screen.getAllByText("sprint")[0];
    if (target) await fireEvent.contextMenu(target);

    // The declared item shape in env.d.ts carries no `click`, so the cast is how every menu
    // test in this repo reaches an item's callback (workspace-service.test.ts does the same).
    (__testing.lastOpenMenu().items[0] as unknown as { click(): void }).click();

    expect(
      harness.modals.lastOpen<{ entry: { kind: string; journalName?: string } }, void>().props.entry,
    ).toMatchObject({ kind: "interval", journalName: "sprint" });
  });
});

describe("NavigationCodeBlock hover preview", () => {
  it("resolves the target path for previewFirstPath when pointer enters a segment", async () => {
    const { harness } = await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          lines: [[buildNavSegment({ template: "today", color: transparent, link: "self" })]],
        }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const target = screen.getAllByText("today")[1];
    if (target) await fireEvent.pointerEnter(target, { ctrlKey: true });

    expect(hoverPreviewPaths(harness)).toEqual(["Daily/2026-05-27.md"]);
  });
});

describe("NavigationCodeBlock decorations", () => {
  it("wraps individual segment text with CellDecoration when addDecorations is true", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          decorateWholeBlock: false,
          lines: [[buildNavSegment({ template: "today", color: transparent, link: "self", addDecorations: true })]],
        }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const decorations = document.querySelectorAll("[data-testid='cell-decoration']");
    expect(decorations.length).toBe(3);
  });

  it("applies the journal's own decorations when the journal belongs to no shelf", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock(
          {
            decorateWholeBlock: true,
            lines: [[buildNavSegment({ template: "today", color: transparent })]],
          },
          { decorations: [cornerDecoration()] },
        ),
      },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    expect(document.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });

  it("excludes a same-type shelf mate's decorations from a whole-block decoration", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock(
          {
            decorateWholeBlock: true,
            lines: [[buildNavSegment({ template: "today", color: transparent })]],
          },
          { decorations: [] },
        ),
        other: fixedJournal("other", { type: "day" }, { decorations: [cornerDecoration()] }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily", "other"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    expect(document.querySelector(".decoration-corner.top-left")).toBeNull();
  });

  it("includes a same-type shelf mate's decorations in a per-segment decoration", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock(
          {
            decorateWholeBlock: false,
            lines: [[buildNavSegment({ template: "today", color: transparent, addDecorations: true })]],
          },
          { decorations: [] },
        ),
        other: fixedJournal("other", { type: "day" }, { decorations: [cornerDecoration()] }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily", "other"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    expect(document.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });

  // Every shipped default's decorated segment is link: "self", so this is the case that must
  // keep reaching same-write-type shelf mates — narrowing it to the host alone would silently
  // change decoration on every existing config with no change to that config (see
  // segment-decoration.ts and CLAUDE.md's "Decorations and nav blocks").
  it("includes a same-type shelf mate's decorations in a default link: self segment", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock(
          {
            decorateWholeBlock: false,
            lines: [[buildNavSegment({ template: "today", color: transparent, link: "self", addDecorations: true })]],
          },
          { decorations: [] },
        ),
        "work-daily": fixedJournal("work-daily", { type: "day" }, { decorations: [cornerDecoration()] }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily", "work-daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    expect(document.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });

  it("excludes a vault-wide date decoration from a custom journal's segment", async () => {
    const sprint = customJournal("sprint", "week", 2, "2026-05-25");
    await renderNav("Sprint/2026-05-25.md", {
      journals: {
        sprint: {
          ...sprint,
          navBlock: {
            ...sprint.navBlock,
            type: "existing",
            lines: [[buildNavSegment({ template: "sprint", color: transparent, addDecorations: true })]],
          },
        },
      },
      calendarDecorations: [
        buildCalendarDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
      entries: [journalEntry("sprint", "2026-05-25", "Sprint/2026-05-25.md")],
    });

    expect(document.querySelector(".decoration-corner.top-left")).toBeNull();
  });

  it("wraps the entire column with CellDecoration when decorateWholeBlock is true", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          decorateWholeBlock: true,
          lines: [[buildNavSegment({ template: "today", color: transparent })]],
        }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const decorations = document.querySelectorAll("[data-testid='cell-decoration']");
    expect(decorations.length).toBe(3);
  });

  it("decorates a year-link segment from the year journal, not the host daily journal", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock({
          decorateWholeBlock: false,
          lines: [
            [
              buildNavSegment({
                template: "{{date:YYYY}}",
                color: transparent,
                link: "year",
                addDecorations: true,
              }),
            ],
          ],
        }),
        yearly: fixedJournal("yearly", { type: "year" }, { decorations: [cornerDecoration()] }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily", "yearly"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    expect(document.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });

  it("leaves a year-link segment undecorated when only the host journal has decorations", async () => {
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock(
          {
            decorateWholeBlock: false,
            lines: [
              [
                buildNavSegment({
                  template: "{{date:YYYY}}",
                  color: transparent,
                  link: "year",
                  addDecorations: true,
                }),
              ],
            ],
          },
          { decorations: [cornerDecoration()] },
        ),
        yearly: fixedJournal("yearly", { type: "year" }),
      },
      shelves: { main: buildShelf("main", { journals: ["daily", "yearly"] }) },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    expect(document.querySelector(".decoration-corner.top-left")).toBeNull();
  });

  it("leaves a segment with no resolvable link target undecorated, even though its host period is already decorated", async () => {
    // No year-type journal exists anywhere, so the second segment's link resolves to nothing.
    await renderNav("Daily/2026-05-27.md", {
      journals: {
        daily: dailyWithNavBlock(
          {
            decorateWholeBlock: false,
            lines: [
              [
                buildNavSegment({ template: "self", color: transparent, link: "self", addDecorations: true }),
                buildNavSegment({ template: "orphan", color: transparent, link: "year", addDecorations: true }),
              ],
            ],
          },
          { decorations: [cornerDecoration()] },
        ),
      },
      entries: [journalEntry("daily", "2026-05-27", "Daily/2026-05-27.md")],
    });

    const selfSegment = screen.getAllByText("self")[1];
    expect(selfSegment?.closest("[data-testid=cell-decoration]")).not.toBeNull();

    const orphanSegment = screen.getAllByText("orphan")[1];
    expect(orphanSegment?.closest("[data-testid=cell-decoration]")).toBeNull();
  });
});
