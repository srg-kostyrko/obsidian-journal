import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import type * as CalendarModule from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type RefDateOrigin, type ViewContext } from "../../view-context";

import { weekCalendarBlock, type WeekCalendarConfig } from "./week-calendar-block";

import type { BlockInstanceId } from "../../config";

vi.mock("@/calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof CalendarModule>();
  return { ...actual, useResolvedWeekPlacement: () => ref("left" as const) };
});

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

function mountBlock(config: WeekCalendarConfig, contextOverride: Partial<ViewContext> = {}) {
  const container = new Container();
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
};

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => {
  cleanup();
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

  it("holds the window on a followed date that is already visible", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    const { getAllByTestId } = mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });
    const start = getAllByTestId("week-stub")[0]?.dataset.week;

    refDateOrigin.value = "follow";
    refDate.value = "2026-05-22" as AnchorString;
    await nextTick();

    expect(getAllByTestId("week-stub")[0]?.dataset.week).toBe(start);
  });

  it("re-centers the window on a navigated date that it already contained", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    const { getAllByTestId } = mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });
    const start = getAllByTestId("week-stub")[0]?.dataset.week;

    refDate.value = "2026-05-22" as AnchorString;
    await nextTick();

    expect(getAllByTestId("week-stub")[0]?.dataset.week).not.toBe(start);
  });
});
