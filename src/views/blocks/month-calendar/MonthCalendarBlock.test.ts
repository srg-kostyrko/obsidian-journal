import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, nextTick, ref, type PropType } from "vue";

import { calendarDisplaySlice } from "@/calendar/settings/display-slice";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { anchor } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { testContainer } from "@/testing";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type RefDateOrigin, type ViewContext } from "../../view-context";

import { monthCalendarBlock, type MonthCalendarConfig } from "./month-calendar-block";

import type { BlockInstanceId } from "../../config";

interface MonthLike {
  start: { toAnchor(): string };
}

const NotesMonthViewStub = defineComponent({
  props: {
    month: { type: Object, required: true },
    shelf: { type: [String, null], default: null },
    outsideDates: { type: String, default: "active" },
    showHeader: { type: Boolean, default: false },
    showWeekdays: { type: Boolean, default: false },
    sixRows: { type: Boolean, default: false },
    selectedDate: { type: String, default: undefined },
    selectDate: { type: Function as PropType<(date: AnchorString) => void>, default: undefined },
  },
  setup: (p) => () =>
    h(
      "div",
      {
        "data-testid": "month-stub",
        "data-month": (p.month as unknown as MonthLike).start.toAnchor(),
        "data-shelf": p.shelf ?? "",
        "data-outside-dates": p.outsideDates,
        "data-show-header": String(p.showHeader),
        "data-show-weekdays": String(p.showWeekdays),
        "data-six-rows": String(p.sixRows),
        "data-selected-date": p.selectedDate,
      },
      h("button", {
        "data-testid": "select-date",
        onClick: () => p.selectDate?.(anchor("2026-05-25")),
      }),
    ),
});

async function mountBlock(
  config: MonthCalendarConfig,
  contextOverride: Partial<ViewContext> = {},
  display: Record<string, unknown> = {},
) {
  const harness = await testContainer({ modules: [calendarSettingsCoreModule], data: { calendarDisplay: display } });
  const context = provideViewContextStub(contextOverride);
  const renderRoot = () => h(monthCalendarBlock.component, { instanceId: "block-1" as BlockInstanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  harness.render(Wrapper, { global: { stubs: { NotesMonthView: NotesMonthViewStub } } });
  return harness;
}

const baseConfig: MonthCalendarConfig = {
  before: 0,
  after: 0,
  hiddenWeekdays: [],
  weeks: "left",
  showHeading: "default",
  showWeekdays: "default",
  outsideDays: "default",
  monthRows: "default",
};

function outside(): (string | undefined)[] {
  return screen.getAllByTestId("month-stub").map((s) => s.dataset.outsideDates);
}

describe("MonthCalendarBlock", () => {
  it("renders the calendar when the vault has no journals", async () => {
    await mountBlock(baseConfig, { shelf: computed(() => null) });
    expect(screen.getAllByTestId("month-stub").length).toBe(1);
  });

  it("renders a single NotesMonthView when before=0 and after=0", async () => {
    await mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(screen.getAllByTestId("month-stub").length).toBe(1);
  });

  it("renders before + after + 1 NotesMonthView instances", async () => {
    await mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate: ref("2026-05-15" as AnchorString) });
    expect(screen.getAllByTestId("month-stub").length).toBe(3);
  });

  it("dims outside-month days when a single month is shown", async () => {
    await mountBlock(baseConfig, { refDate: ref("2026-05-15" as AnchorString) });
    expect(screen.getAllByTestId("month-stub").every((s) => s.dataset.outsideDates === "active")).toBe(true);
  });

  it("blanks outside-month days when more than one month is shown", async () => {
    await mountBlock({ ...baseConfig, before: 1 }, { refDate: ref("2026-05-15" as AnchorString) });
    expect(screen.getAllByTestId("month-stub").every((s) => s.dataset.outsideDates === "blank")).toBe(true);
  });

  it("anchors the first NotesMonthView at refDate shifted back by before months", async () => {
    await mountBlock({ ...baseConfig, before: 2 }, { refDate: ref("2026-05-15" as AnchorString) });
    expect(screen.getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-03-01");
  });

  it("passes the current shelf to each NotesMonthView", async () => {
    await mountBlock({ ...baseConfig, after: 1 }, { shelf: ref("my-shelf") });
    expect(screen.getAllByTestId("month-stub").every((s) => s.dataset.shelf === "my-shelf")).toBe(true);
  });

  it("passes refDate and selection through to each NotesMonthView", async () => {
    const selectRefDate = vi.fn();
    const setRefDate = vi.fn();
    await mountBlock(baseConfig, {
      refDate: ref("2026-05-15" as AnchorString),
      selectRefDate,
      setRefDate,
    });

    expect(screen.getAllByTestId("month-stub")[0]?.dataset.selectedDate).toBe("2026-05-15");
    screen.getByTestId("select-date").click();
    expect(selectRefDate).toHaveBeenCalledWith("2026-05-25");
    expect(setRefDate).not.toHaveBeenCalled();
  });

  it("holds the window on a selected date that is already visible", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    await mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });

    refDateOrigin.value = "select";
    refDate.value = "2026-06-03" as AnchorString;
    await nextTick();

    expect(screen.getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-04-01");
  });

  it("re-lays-out for a selected date the window does not show", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    await mountBlock(baseConfig, { refDate, refDateOrigin });

    refDateOrigin.value = "select";
    refDate.value = "2026-06-03" as AnchorString;
    await nextTick();

    expect(screen.getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-06-01");
  });

  it("holds the window on a followed date that is already visible", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    await mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });

    refDateOrigin.value = "follow";
    refDate.value = "2026-04-02" as AnchorString;
    await nextTick();

    expect(screen.getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-04-01");
  });

  it("re-centers the window on a navigated date that it already contained", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    await mountBlock({ ...baseConfig, before: 1, after: 1 }, { refDate, refDateOrigin });

    refDate.value = "2026-04-02" as AnchorString;
    await nextTick();

    expect(screen.getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-03-01");
  });

  it("re-lays-out for a followed date whose month it only paints in its margin", async () => {
    const refDate = ref("2026-04-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    await mountBlock(baseConfig, { refDate, refDateOrigin });

    refDateOrigin.value = "follow";
    refDate.value = "2026-05-01" as AnchorString;
    await nextTick();

    expect(screen.getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-05-01");
  });

  it("holds its layout for a followed date in an adjacent month it displays", async () => {
    const refDate = ref("2026-04-15" as AnchorString);
    const refDateOrigin = ref<RefDateOrigin>("navigate");
    await mountBlock({ ...baseConfig, after: 1 }, { refDate, refDateOrigin });

    refDateOrigin.value = "follow";
    refDate.value = "2026-05-01" as AnchorString;
    await nextTick();

    expect(screen.getAllByTestId("month-stub")[0]?.dataset.month).toBe("2026-04-01");
  });

  describe("visibility overrides", () => {
    const refDate = { refDate: ref("2026-05-15" as AnchorString) };

    it("keeps the automatic outside-days rule when the global is automatic", async () => {
      await mountBlock(baseConfig, refDate, { outsideDays: "automatic" });
      expect(outside()).toEqual(["active"]);
    });

    it("blanks outside days on automatic once the window holds several months", async () => {
      await mountBlock({ ...baseConfig, before: 1 }, refDate, { outsideDays: "automatic" });
      expect(outside()).toEqual(["blank", "blank"]);
    });

    it("lets an inert block override the automatic rule whatever the month count", async () => {
      await mountBlock({ ...baseConfig, before: 1, outsideDays: "inert" }, refDate);
      expect(outside()).toEqual(["inactive", "inactive"]);
    });

    it("follows a hidden global when the block says default", async () => {
      await mountBlock(baseConfig, refDate, { outsideDays: "hidden" });
      expect(outside()).toEqual(["blank"]);
    });

    it("re-renders a default heading when the global changes, without a remount", async () => {
      const harness = await mountBlock(baseConfig, refDate);
      expect(screen.getByTestId("month-stub").dataset.showHeader).toBe("true");

      const slice = harness.settings.getSlice(calendarDisplaySlice);
      slice.state = { ...slice.state, showHeading: false };
      await nextTick();

      expect(screen.getByTestId("month-stub").dataset.showHeader).toBe("false");
    });

    it("keeps an explicit heading over a hidden global", async () => {
      await mountBlock({ ...baseConfig, showHeading: true }, refDate, { showHeading: false });
      expect(screen.getByTestId("month-stub").dataset.showHeader).toBe("true");
    });

    it("keeps a legacy stored false hiding the heading", async () => {
      await mountBlock({ ...baseConfig, showHeading: false }, refDate);
      expect(screen.getByTestId("month-stub").dataset.showHeader).toBe("false");
    });

    it("passes the weekday header choice through", async () => {
      await mountBlock({ ...baseConfig, showWeekdays: false }, refDate);
      expect(screen.getByTestId("month-stub").dataset.showWeekdays).toBe("false");
    });

    it("passes always-six rows to the view as sixRows", async () => {
      await mountBlock({ ...baseConfig, monthRows: "six" }, refDate);
      expect(screen.getByTestId("month-stub").dataset.sixRows).toBe("true");
    });

    it("follows the global row rule on default", async () => {
      await mountBlock(baseConfig, refDate, { monthRows: "six" });
      expect(screen.getByTestId("month-stub").dataset.sixRows).toBe("true");
    });
  });
});
