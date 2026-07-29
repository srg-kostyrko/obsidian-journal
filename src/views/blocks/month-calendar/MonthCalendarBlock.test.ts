import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, nextTick, ref } from "vue";

import type * as CalendarModule from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type RefDateOrigin, type ViewContext } from "../../view-context";

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

function mountBlock(config: MonthCalendarConfig, contextOverride: Partial<ViewContext> = {}) {
  const container = new Container();
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
};

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => {
  cleanup();
});

describe("MonthCalendarBlock", () => {
  it("renders the calendar when the vault has no journals", () => {
    const { getAllByTestId } = mountBlock(baseConfig, { shelf: computed(() => null) });
    expect(getAllByTestId("month-stub").length).toBe(1);
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

  it("holds the window on a followed date that is already visible", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    const { getAllByTestId } = mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });

    refDateOrigin.value = "follow";
    refDate.value = "2026-04-02" as AnchorString;
    await nextTick();

    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-04-01");
  });

  it("re-centers the window on a navigated date that it already contained", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    const { getAllByTestId } = mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });

    refDate.value = "2026-04-02" as AnchorString;
    await nextTick();

    expect(getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-03-01");
  });
});
