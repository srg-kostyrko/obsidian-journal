import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, nextTick, ref } from "vue";

import type * as CalendarModule from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { monthCalendarBlock, type MonthCalendarConfig } from "./month-calendar-block";

import type { BlockInstanceId } from "../../config";

vi.mock("@/calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof CalendarModule>();
  return { ...actual, useResolvedWeekPlacement: () => ref("left" as const) };
});

vi.mock("@/notes-calendar/ui/NotesMonthView.vue", () => ({
  default: defineComponent({
    props: {
      month: { type: Object, required: true },
      shelf: { type: [String, null], default: null },
      outsideDates: { type: String, default: "active" },
    },
    setup: (p) => {
      interface MonthLike {
        start: { toAnchor(): string };
      }
      return () =>
        h("div", {
          "data-testid": "month-stub",
          "data-month": (p.month as unknown as MonthLike).start.toAnchor(),
          "data-shelf": p.shelf ?? "",
          "data-outside-dates": p.outsideDates,
        });
    },
  }),
}));

const FIXED: { names: readonly string[] } = { names: [] };
const CUSTOM: { names: readonly string[] } = { names: [] };
vi.mock("@/notes-calendar/use-shelf-scope", () => ({
  useShelfScope: () => ({
    all: computed<readonly string[]>(() => [...FIXED.names, ...CUSTOM.names]),
    fixed: computed<readonly string[]>(() => FIXED.names),
    day: computed<readonly string[]>(() => []),
    week: computed<readonly string[]>(() => []),
    month: computed<readonly string[]>(() => []),
    quarter: computed<readonly string[]>(() => []),
    year: computed<readonly string[]>(() => []),
    custom: computed<readonly string[]>(() => CUSTOM.names),
  }),
}));

const ACTIVE = ref<ActiveEntryRef | null>(null);

function mountBlock(config: MonthCalendarConfig, contextOverride: Partial<ViewContext> = {}) {
  const container = new Container();
  container.register(ActiveEntryViewModel).useValue({ active: ACTIVE } as unknown as ActiveEntryViewModel);
  const context = provideViewContextStub(contextOverride);
  const renderRoot = () => h(monthCalendarBlock.component, { instanceId: "block-1" as BlockInstanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  return render(Wrapper, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

const baseConfig: MonthCalendarConfig = {
  before: 0,
  after: 0,
  hiddenWeekdays: [],
  weeks: "left",
  showHeading: true,
  followActiveDate: true,
};

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => {
  cleanup();
  FIXED.names = [];
  CUSTOM.names = [];
  ACTIVE.value = null;
});

describe("MonthCalendarBlock", () => {
  it("says there are no journals at all when the view is not scoped to a shelf", () => {
    // An unscoped calendar shows every journal, so an empty scope means the vault has none —
    // which is what a fresh install looks like. Blaming a shelf misdiagnoses it.
    const { getByText } = mountBlock(baseConfig, { shelf: computed(() => null) });
    expect(getByText(m.common_no_journals_yet())).toBeTruthy();
  });

  it("blames the shelf only when the view is scoped to one", () => {
    const { getByText } = mountBlock(baseConfig, { shelf: computed(() => "my-shelf") });
    expect(getByText(m.view_block_calendar_no_journals())).toBeTruthy();
  });

  it("renders a single NotesMonthView when before=0 and after=0", () => {
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub").length).toBe(1);
  });

  it("renders before + after + 1 NotesMonthView instances", () => {
    const { getAllByTestId } = mountBlock(
      { ...baseConfig, before: 1, after: 1 },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(getAllByTestId("month-stub").length).toBe(3);
  });

  it("dims outside-month days when a single month is shown", () => {
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub").every((s) => s.dataset.outsideDates === "active")).toBe(true);
  });

  it("blanks outside-month days when more than one month is shown", () => {
    const { getAllByTestId } = mountBlock({ ...baseConfig, before: 1 }, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub").every((s) => s.dataset.outsideDates === "blank")).toBe(true);
  });

  it("anchors the first NotesMonthView at refDate shifted back by before months", () => {
    const { getAllByTestId } = mountBlock({ ...baseConfig, before: 2 }, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-03-01");
  });

  it("passes the current shelf to each NotesMonthView", () => {
    const { getAllByTestId } = mountBlock({ ...baseConfig, after: 1 }, { shelf: ref("my-shelf") });
    expect(getAllByTestId("month-stub").every((s) => s.dataset.shelf === "my-shelf")).toBe(true);
  });

  it("recenters to the active note's month when it is off-window and following", () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-09-10" as AnchorString };
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-09-01");
  });

  it("recenters to an active custom-interval note's month when following", () => {
    // v2 moved the whole panel for custom notes too; only the cell highlight is
    // fixed-journal-scoped, not the follow.
    CUSTOM.names = ["sprint"];
    ACTIVE.value = { journalName: "sprint", anchor: "2026-09-10" as AnchorString };
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-09-01");
  });

  it("stays on the reference month when following is off", () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-09-10" as AnchorString };
    const { getAllByTestId } = mountBlock(
      { ...baseConfig, followActiveDate: false },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-05-01");
  });

  it("stays on the reference window when the active note's month is already visible", () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-05-02" as AnchorString };
    const { getAllByTestId } = mountBlock(
      { ...baseConfig, before: 1, after: 1 },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-04-01");
  });

  it("returns to the reference month when the active note becomes out of scope", async () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-09-10" as AnchorString };
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-09-01");
    ACTIVE.value = { journalName: "weekly", anchor: "2026-11-01" as AnchorString };
    await nextTick();
    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-05-01");
  });
});
