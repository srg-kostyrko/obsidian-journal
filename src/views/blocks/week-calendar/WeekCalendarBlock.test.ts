import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, type PropType } from "vue";

import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { anchor } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { testContainer } from "@/testing";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type RefDateOrigin, type ViewContext } from "../../view-context";

import { weekCalendarBlock, type WeekCalendarConfig } from "./week-calendar-block";

import type { BlockInstanceId } from "../../config";

interface WeekLike {
  start: { toAnchor(): string };
}

const NotesWeekViewStub = defineComponent({
  props: {
    week: { type: Object, required: true },
    shelf: { type: [String, null], default: null },
    selectedDate: { type: String, default: undefined },
    selectDate: { type: Function as PropType<(date: AnchorString) => void>, default: undefined },
  },
  setup: (p) => () =>
    h(
      "div",
      {
        "data-testid": "week-stub",
        "data-week": (p.week as unknown as WeekLike).start.toAnchor(),
        "data-shelf": p.shelf ?? "",
        "data-selected-date": p.selectedDate,
      },
      h("button", {
        "data-testid": "select-date",
        onClick: () => p.selectDate?.(anchor("2026-05-25")),
      }),
    ),
});

async function mountBlock(config: WeekCalendarConfig, contextOverride: Partial<ViewContext> = {}) {
  const harness = await testContainer({ modules: [calendarSettingsCoreModule] });
  const context = provideViewContextStub(contextOverride);
  const renderRoot = () => h(weekCalendarBlock.component, { instanceId: "block-1" as BlockInstanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  return harness.render(Wrapper, { global: { stubs: { NotesWeekView: NotesWeekViewStub } } });
}

const baseConfig: WeekCalendarConfig = {
  before: 0,
  after: 0,
  hiddenWeekdays: [],
  weeks: "left",
  showHeading: true,
};

describe("WeekCalendarBlock", () => {
  it("renders a single NotesWeekView when before=0 and after=0", async () => {
    const { getAllByTestId } = await mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(getAllByTestId("week-stub").length).toBe(1);
  });

  it("renders before + after + 1 NotesWeekView instances", async () => {
    const { getAllByTestId } = await mountBlock(
      { ...baseConfig, before: 1, after: 1 },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(getAllByTestId("week-stub").length).toBe(3);
  });

  it("passes the current shelf to each NotesWeekView", async () => {
    const { getAllByTestId } = await mountBlock({ ...baseConfig, after: 1 }, { shelf: ref("my-shelf") });
    expect(getAllByTestId("week-stub").every((s) => s.dataset.shelf === "my-shelf")).toBe(true);
  });

  it("passes refDate and selection through to each NotesWeekView", async () => {
    const setRefDate = vi.fn();
    const { getAllByTestId, getByTestId } = await mountBlock(baseConfig, {
      refDate: ref("2026-05-15" as AnchorString),
      setRefDate,
    });

    expect(getAllByTestId("week-stub")[0]?.dataset.selectedDate).toBe("2026-05-15");
    getByTestId("select-date").click();
    expect(setRefDate).toHaveBeenCalledWith("2026-05-25");
  });

  it("holds the window on a followed date that is already visible", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    const { getAllByTestId } = await mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });
    const start = getAllByTestId("week-stub")[0]?.dataset.week;

    refDateOrigin.value = "follow";
    refDate.value = "2026-05-22" as AnchorString;
    await nextTick();

    expect(getAllByTestId("week-stub")[0]?.dataset.week).toBe(start);
  });

  it("re-centers the window on a navigated date that it already contained", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    const { getAllByTestId } = await mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });
    const start = getAllByTestId("week-stub")[0]?.dataset.week;

    refDate.value = "2026-05-22" as AnchorString;
    await nextTick();

    expect(getAllByTestId("week-stub")[0]?.dataset.week).not.toBe(start);
  });
});
