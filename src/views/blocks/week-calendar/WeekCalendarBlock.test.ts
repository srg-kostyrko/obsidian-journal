import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, nextTick, ref } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { weekCalendarBlock, type WeekCalendarConfig } from "./week-calendar-block";

import type { BlockInstanceId } from "../../config";

vi.mock("@/notes-calendar/ui/NotesWeekView.vue", () => ({
  default: defineComponent({
    props: { week: { type: Object, required: true }, shelf: { type: [String, null], default: null } },
    setup: (p) => {
      interface WeekLike {
        start: { toAnchor(): string };
      }
      return () =>
        h("div", {
          "data-testid": "week-stub",
          "data-week": (p.week as unknown as WeekLike).start.toAnchor(),
          "data-shelf": p.shelf ?? "",
        });
    },
  }),
}));

const FIXED: { names: readonly string[] } = { names: [] };
vi.mock("@/notes-calendar/use-shelf-scope", () => ({
  useShelfScope: () => ({
    all: computed<readonly string[]>(() => FIXED.names),
    fixed: computed<readonly string[]>(() => FIXED.names),
    day: computed<readonly string[]>(() => []),
    week: computed<readonly string[]>(() => []),
    month: computed<readonly string[]>(() => []),
    quarter: computed<readonly string[]>(() => []),
    year: computed<readonly string[]>(() => []),
    custom: computed<readonly string[]>(() => []),
  }),
}));

const ACTIVE = ref<ActiveEntryRef | null>(null);

function mountBlock(config: WeekCalendarConfig, contextOverride: Partial<ViewContext> = {}) {
  const container = new Container();
  container.register(ActiveEntryViewModel).useValue({ active: ACTIVE } as unknown as ActiveEntryViewModel);
  const context = provideViewContextStub(contextOverride);
  const renderRoot = () => h(weekCalendarBlock.component, { instanceId: "block-1" as BlockInstanceId, config });
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

const baseConfig: WeekCalendarConfig = {
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
  ACTIVE.value = null;
});

describe("WeekCalendarBlock", () => {
  it("renders a single NotesWeekView when before=0 and after=0", () => {
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("week-stub").length).toBe(1);
  });

  it("renders before + after + 1 NotesWeekView instances", () => {
    const { getAllByTestId } = mountBlock(
      { ...baseConfig, before: 1, after: 1 },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(getAllByTestId("week-stub").length).toBe(3);
  });

  it("passes the current shelf to each NotesWeekView", () => {
    const { getAllByTestId } = mountBlock({ ...baseConfig, after: 1 }, { shelf: ref("my-shelf") });
    expect(getAllByTestId("week-stub").every((s) => s.dataset.shelf === "my-shelf")).toBe(true);
  });

  it("recenters to the active note's week when it is off-window and following", () => {
    FIXED.names = ["daily"];
    const target = "2026-09-10" as AnchorString;
    ACTIVE.value = { journalName: "daily", anchor: target };
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    const focusWeekAnchor = getAllByTestId("week-stub")[0]?.dataset.week ?? "";
    // The single rendered week must be the one containing the active note, not May's week.
    expect(focusWeekAnchor <= "2026-09-10" && "2026-09-10" <= addSixDays(focusWeekAnchor)).toBe(true);
  });

  it("stays on the reference week when following is off", () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-09-10" as AnchorString };
    // Mount off-block first, capture its week, then clean up before mounting the follow-on block
    // so that getAllByTestId queries are scoped to one block at a time.
    const off = mountBlock({ ...baseConfig, followActiveDate: false }, { refDate: ref("2026-05-15" as AnchorString) });
    const offWeek = off.getAllByTestId("week-stub")[0]?.dataset.week;
    cleanup();
    const followed = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    const followedWeek = followed.getAllByTestId("week-stub")[0]?.dataset.week;
    expect(offWeek).not.toBe(followedWeek);
  });

  it("returns to the reference week when the active note clears", async () => {
    FIXED.names = ["daily"];
    ACTIVE.value = { journalName: "daily", anchor: "2026-09-10" as AnchorString };
    const { getAllByTestId } = mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    const followedWeek = getAllByTestId("week-stub")[0]?.dataset.week;
    ACTIVE.value = null;
    await nextTick();
    const resetWeek = getAllByTestId("week-stub")[0]?.dataset.week;
    expect(resetWeek).not.toBe(followedWeek);
  });
});

function addSixDays(anchor: string): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}
