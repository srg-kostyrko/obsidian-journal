import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, inject, type PropType } from "vue";

import { CalendarDate, calendarDisplaySlice, type CalendarDisplaySliceState, type Period } from "@/calendar";
import { date } from "@/calendar/testing";
import { cellKey } from "@/decorations/engine";
import { CellDecorationMapKey } from "@/decorations/ui/cell-decoration-map-key";

import { calendarStyleRules } from "../../testing";

import AppearancePreview from "./AppearancePreview.vue";
import { partsAt } from "./preview-sample";

// Happy-dom applies no SFC style, so the probe reads the injected map that CellDecoration paints from.
const DecorationProbe = defineComponent({
  props: { period: { type: Object as PropType<Period>, required: true } },
  setup(props, { slots }) {
    const cells = inject(CellDecorationMapKey, null);
    return () => {
      const styles = cells?.get(cellKey(props.period.kind, props.period.anchor.toAnchor()))?.value ?? [];
      return h(
        "span",
        {
          "data-decoration": styles.length > 0 ? styles.map((style) => style.type).join(",") : undefined,
          "data-theme-colors": styles
            .map((style) => ("color" in style && style.color.type === "theme" ? style.color.name : ""))
            .join(","),
        },
        slots.default?.(),
      );
    };
  },
});

function cellAt(container: Element, anchor: string): HTMLElement {
  const cell = [...container.querySelectorAll<HTMLElement>('[data-preview-part="date"]')].find(
    (candidate) => candidate.dataset.anchor === anchor,
  );
  if (cell === undefined) throw new Error(`no date cell at ${anchor}`);
  return cell;
}

function picked(container: Element): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".appearance-preview__picked")];
}

const isLight = (element: Element): boolean => element.classList.contains("appearance-preview__picked--light");

const withDisplay = (patch: Partial<CalendarDisplaySliceState>) =>
  render(AppearancePreview, { props: { width: "wide", display: { ...calendarDisplaySlice.defaults, ...patch } } });
const rowsOf = (container: Element): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(".appearance-preview__grid > .appearance-preview__row"),
];
const firstWeekRow = (container: Element): HTMLElement | undefined => rowsOf(container).at(1);
const partOf = (element: Element | null | undefined): string | undefined =>
  element instanceof HTMLElement ? element.dataset.previewPart : undefined;

const weekdays = (container: Element) =>
  [...container.querySelectorAll('[data-preview-part="weekday"]')].map((header) => ({
    wide: header.querySelector(".appearance-preview__weekday-wide")?.textContent?.trim(),
    narrow: header.querySelector(".appearance-preview__weekday-narrow")?.textContent?.trim(),
  }));

describe("AppearancePreview", () => {
  beforeEach(() => {
    vi.spyOn(CalendarDate, "today").mockReturnValue(date("2026-05-13"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits the parts under a clicked cell, with no service container to open a note through", async () => {
    // Rendered with no DI container: a cell API that reached a service would throw on mount.
    const { container, emitted } = render(AppearancePreview, { props: { width: "wide" } });
    const today = cellAt(container, "2026-05-13");

    await userEvent.click(today);

    expect(emitted("pick")).toEqual([[partsAt(today), "2026-05-13"]]);
    expect(partsAt(today)).toEqual(["today", "currentWeek", "date", "cell", "grid"]);
  });

  it.each(["{Enter}", " "])("emits the same parts for %j on a focused cell as for a click", async (key) => {
    const { container, emitted } = render(AppearancePreview, { props: { width: "wide" } });
    const today = cellAt(container, "2026-05-13");

    today.focus();
    await userEvent.keyboard(key);

    expect(emitted("pick")).toEqual([[["today", "currentWeek", "date", "cell", "grid"], "2026-05-13"]]);
  });

  it("picks the week numbers from their divider", async () => {
    const { container, emitted } = render(AppearancePreview, { props: { width: "wide" } });
    const divider = container.querySelector<HTMLElement>(".notes-calendar-divider");
    if (!divider) throw new Error("no divider");

    await userEvent.click(divider);

    expect(emitted("pick")).toEqual([[["weekNumber", "grid"], undefined]]);
  });

  // The divider takes the pointer here, so it must sit beside the week numbers, not over them.
  it("keeps the current week among the parts of a clicked current week's number", async () => {
    const { container, emitted } = render(AppearancePreview, { props: { width: "wide" } });
    const week = container.querySelector<HTMLElement>(".appearance-preview__week-number[data-current-week]");
    if (!week) throw new Error("no current week's number");

    await userEvent.click(week);

    expect(emitted("pick")).toEqual([[["weekNumber", "currentWeek", "grid"], undefined]]);
  });

  it.each([
    ["left", "2 / 3"],
    ["right", "-3 / -2"],
  ] as const)("draws the divider in its own track beside week numbers on the %s", (weekPlacement, column) => {
    const { container } = withDisplay({ weekPlacement });
    expect(
      [...container.querySelectorAll<HTMLElement>(".notes-calendar-divider")].map(
        (divider) => divider.style.gridColumn,
      ),
    ).toEqual([column]);
  });

  // Laid out as the month view lays it out, so a band or the divider means the same grid lines here.
  it("gives the divider a track of its own and keeps every cell out of it", () => {
    const rules = calendarStyleRules().preview.filter((rule) => rule.container === null && rule.supports === null);
    const declared = (selector: string, property: string): string | undefined =>
      rules
        .find((rule) => rule.selector.split(",").some((part) => part.trim() === selector))
        ?.declarations.get(property);
    expect({
      track: rules
        .find((rule) => rule.selector === ".appearance-preview__grid" && rule.declarations.has("--_divider-track"))
        ?.declarations.get("--_divider-track"),
      left: declared('.appearance-preview__grid[data-weeks="left"]', "grid-template-columns"),
      right: declared('.appearance-preview__grid[data-weeks="right"]', "grid-template-columns"),
      leftDay: declared(
        '.appearance-preview__grid[data-weeks="left"] .appearance-preview__week-number + *',
        "grid-column-start",
      ),
      leftWeekday: declared(
        '.appearance-preview__grid[data-weeks="left"] .appearance-preview__weekday-spacer + *',
        "grid-column-start",
      ),
      rightWeek: declared(
        '.appearance-preview__grid[data-weeks="right"] .appearance-preview__week-number',
        "grid-column",
      ),
      rightSpacer: declared(
        '.appearance-preview__grid[data-weeks="right"] .appearance-preview__weekday-spacer',
        "grid-column",
      ),
    }).toEqual({
      track: "min(var(--size-4-2), var(--_v-week-number-divider-width) * 1000)",
      left: "1fr var(--_divider-track) repeat(7, 1fr)",
      right: "repeat(7, 1fr) var(--_divider-track) 1fr",
      leftDay: "3",
      leftWeekday: "3",
      rightWeek: "-2 / -1",
      rightSpacer: "-2 / -1",
    });
  });

  it("draws no divider without week numbers", () => {
    const { container } = withDisplay({ weekPlacement: "none" });
    expect(container.querySelector(".notes-calendar-divider")).toBeNull();
  });

  // The divider takes no pointer in a calendar, so the preview gives it one back for picking.
  it("lets the divider take the pointer in the preview", () => {
    const rule = calendarStyleRules().preview.find(
      (candidate) => candidate.container === null && candidate.selector.endsWith(".appearance-preview__divider"),
    );
    expect(rule?.declarations.get("pointer-events")).toBe("auto");
  });

  it("marks the open note two days after today, unselected", () => {
    const { container } = render(AppearancePreview, { props: { width: "wide" } });
    const open = cellAt(container, "2026-05-15");
    expect(open.dataset.active).toBe("true");
    expect(open.dataset.selected).toBeUndefined();
    expect(container.querySelectorAll("[data-active]")).toHaveLength(1);
  });

  it("selects a weekend day in today's week, which is not the open note's", () => {
    const { container } = render(AppearancePreview, { props: { width: "wide" } });
    const selected = cellAt(container, "2026-05-16");
    expect(selected.dataset.selected).toBe("true");
    expect(selected.dataset.active).toBeUndefined();
    expect(container.querySelectorAll("[data-selected]")).toHaveLength(1);
  });

  it("leaves today a plain today: neither open nor selected", () => {
    const { container } = render(AppearancePreview, { props: { width: "wide" } });
    const today = cellAt(container, "2026-05-13");
    expect(today.dataset.today).toBe("true");
    expect(today.dataset.active).toBeUndefined();
    expect(today.dataset.selected).toBeUndefined();
  });

  it("shows outside days as interactive cells", () => {
    const { container } = render(AppearancePreview, { props: { width: "wide" } });
    const outside = container.querySelectorAll<HTMLElement>('[data-preview-part="date"][data-outside]');
    expect(outside.length).toBeGreaterThan(0);
    for (const cell of outside) expect(cell.dataset.inactive).toBeUndefined();
  });

  it("decorates the selected day alone, with a background and a text color", () => {
    const { container } = render(AppearancePreview, {
      props: { width: "wide" },
      global: { stubs: { CellDecoration: DecorationProbe } },
    });
    const decorated = [...container.querySelectorAll<HTMLElement>("[data-decoration]")].map((probe) => [
      probe.closest<HTMLElement>(".notes-calendar-cell")?.dataset.anchor,
      probe.dataset.decoration,
    ]);
    expect(decorated).toHaveLength(1);
    const [anchor, styles] = decorated.at(0) ?? [];
    expect(styles).toBe("background,color");
    expect(anchor).toBe("2026-05-16");
  });

  // --text-highlight-bg is gone from Obsidian 1.14's app.css, which would leave the sample with no
  // background; --background-secondary is a solid color on every supported version.
  it("paints the sample decoration's background from a theme color every supported Obsidian defines", () => {
    const { container } = render(AppearancePreview, {
      props: { width: "wide" },
      global: { stubs: { CellDecoration: DecorationProbe } },
    });
    expect(container.querySelector<HTMLElement>("[data-decoration]")?.dataset.themeColors).toBe(
      "background-secondary,text-accent",
    );
  });

  describe("outlines the part being edited", () => {
    it("outlines nothing while no part is picked", () => {
      const { container } = render(AppearancePreview, { props: { width: "wide" } });
      expect(picked(container)).toEqual([]);
    });

    it("outlines the cell in a state", () => {
      const { container } = render(AppearancePreview, { props: { width: "wide", picked: "today" } });
      expect(picked(container)).toEqual([cellAt(container, "2026-05-13")]);
    });

    it("outlines every cell of a state several days share", () => {
      const { container } = render(AppearancePreview, { props: { width: "wide", picked: "outside" } });
      const outside = [...container.querySelectorAll<HTMLElement>('[data-preview-part="date"][data-outside]')];
      expect(outside.length).toBeGreaterThan(1);
      expect(picked(container)).toEqual(outside);
    });

    it("outlines only the spot's day for a part every day has, and every day with no spot", async () => {
      const { container, rerender } = render(AppearancePreview, { props: { width: "wide", picked: "cell" } });
      expect(picked(container)).toHaveLength(container.querySelectorAll('[data-preview-part="date"]').length);

      await rerender({ width: "wide", picked: "cell", spot: "2026-05-20" });

      expect(picked(container)).toEqual([cellAt(container, "2026-05-20")]);
    });

    it("reports the clicked day with the parts", async () => {
      const { container, emitted } = render(AppearancePreview, { props: { width: "wide" } });

      await userEvent.click(cellAt(container, "2026-05-20"));

      expect(emitted("pick")).toEqual([[["date", "cell", "grid"], "2026-05-20"]]);
    });

    it("outlines every weekday name", () => {
      const { container } = render(AppearancePreview, { props: { width: "wide", picked: "weekday" } });
      expect(picked(container)).toEqual([...container.querySelectorAll<HTMLElement>('[data-preview-part="weekday"]')]);
      expect(picked(container)).toHaveLength(7);
    });

    describe("weighs the outline by how many elements it marks", () => {
      it("marks a single day strongly", () => {
        const { container } = render(AppearancePreview, { props: { width: "wide", picked: "today" } });
        expect(picked(container)).toHaveLength(1);
        expect(picked(container).filter(isLight)).toEqual([]);
      });

      it("marks the clicked day strongly for a part every day has", () => {
        const { container } = render(AppearancePreview, {
          props: { width: "wide", picked: "cell", spot: "2026-05-20" },
        });
        expect(picked(container).filter(isLight)).toEqual([]);
      });

      it("marks every day lightly for a part every day has, with no spot", () => {
        const { container } = render(AppearancePreview, { props: { width: "wide", picked: "cell" } });
        const days = [...container.querySelectorAll<HTMLElement>('[data-preview-part="date"]')];
        expect(picked(container)).toEqual(days);
        expect(picked(container).every(isLight)).toBe(true);
      });

      it("marks the week numbers lightly", () => {
        const { container } = render(AppearancePreview, { props: { width: "wide", picked: "weekNumber" } });
        expect(picked(container).length).toBeGreaterThan(1);
        expect(picked(container).every(isLight)).toBe(true);
      });
    });

    it("outlines every week number and their divider, lightly", () => {
      const { container } = render(AppearancePreview, { props: { width: "wide", picked: "weekNumber" } });
      const weekNumbers = [...container.querySelectorAll<HTMLElement>(".appearance-preview__week-number")];
      const divider = container.querySelector<HTMLElement>(".notes-calendar-divider");
      if (!divider) throw new Error("no divider");
      expect(weekNumbers.length).toBeGreaterThan(3);
      expect(picked(container)).toEqual([divider, ...weekNumbers]);
      expect(isLight(divider)).toBe(true);
    });

    it("outlines the weekend days and their weekday headers, and nothing else", () => {
      const { container } = render(AppearancePreview, {
        props: {
          width: "wide",
          picked: "weekend",
          display: { ...calendarDisplaySlice.defaults, weekend: { type: "custom", days: [5] } },
        },
      });
      const fridays = [...container.querySelectorAll<HTMLElement>('[data-preview-part="date"]')].filter(
        (cell) => cell.dataset.weekend !== undefined,
      );
      const header = [...container.querySelectorAll<HTMLElement>('[data-preview-part="weekday"]')].filter(
        (span) => span.dataset.weekend !== undefined,
      );
      expect(header).toHaveLength(1);
      expect(fridays.length).toBeGreaterThan(3);
      expect(new Set(picked(container))).toEqual(new Set([...header, ...fridays]));
      expect(picked(container).every(isLight)).toBe(true);
    });

    it("outlines today's week, its days and its week number, and nothing else", () => {
      const { container } = render(AppearancePreview, { props: { width: "wide", picked: "currentWeek" } });
      const week = [...container.querySelectorAll<HTMLElement>("[data-current-week]")];
      expect(week).toHaveLength(8);
      expect(week.some((element) => element.dataset.previewPart === "weekNumber")).toBe(true);
      expect(new Set(picked(container))).toEqual(new Set(week));
    });

    it("outlines the month grid", () => {
      const { container } = render(AppearancePreview, { props: { width: "wide", picked: "grid" } });
      expect(picked(container)).toEqual([container.querySelector(".appearance-preview__grid")]);
    });

    it("outlines hidden outside days through their blanks", () => {
      const { container } = render(AppearancePreview, {
        props: {
          width: "wide",
          picked: "outside",
          display: { ...calendarDisplaySlice.defaults, outsideDays: "hidden" },
        },
      });
      const blanks = [...container.querySelectorAll<HTMLElement>(".appearance-preview__day--blank")];
      expect(blanks.length).toBeGreaterThan(0);
      expect(picked(container)).toEqual(blanks);
    });

    it("outlines both heading cells", () => {
      const { container } = render(AppearancePreview, { props: { width: "wide", picked: "heading" } });
      const heading = container.querySelector('[data-preview-part="heading"]');
      expect(picked(container)).toEqual([...(heading?.querySelectorAll<HTMLElement>(".notes-calendar-cell") ?? [])]);
      expect(picked(container)).toHaveLength(2);
    });
  });

  describe("follows the visibility settings", () => {
    it("shows the heading, the weekday header and week numbers on the left by default", () => {
      const { container } = withDisplay({});
      expect(container.querySelector('[data-preview-part="heading"]')).not.toBeNull();
      expect(rowsOf(container)[0]?.classList.contains("appearance-preview__row--visually-hidden")).toBe(false);
      expect(partOf(firstWeekRow(container)?.firstElementChild)).toBe("weekNumber");
    });

    it("removes a hidden heading", () => {
      const { container } = withDisplay({ showHeading: false });
      expect(container.querySelector('[data-preview-part="heading"]')).toBeNull();
    });

    it("hides the weekday row from view but keeps its names", () => {
      const { container } = withDisplay({ showWeekdays: false });
      const header = rowsOf(container)[0];
      expect(header?.classList.contains("appearance-preview__row--visually-hidden")).toBe(true);
      expect(header?.querySelectorAll('[data-preview-part="weekday"]')).toHaveLength(7);
    });

    it("moves week numbers to the right", () => {
      const { container } = withDisplay({ weekPlacement: "right" });
      expect(partOf(firstWeekRow(container)?.lastElementChild)).toBe("weekNumber");
      expect(partOf(firstWeekRow(container)?.firstElementChild)).toBe("date");
      expect(container.querySelector<HTMLElement>(".appearance-preview__grid")?.dataset.weeks).toBe("right");
    });

    it("drops week numbers placed nowhere", () => {
      const { container } = withDisplay({ weekPlacement: "none" });
      expect(container.querySelector('[data-preview-part="weekNumber"]')).toBeNull();
      expect(container.querySelector(".appearance-preview__weekday-spacer")).toBeNull();
      expect(container.querySelector<HTMLElement>(".appearance-preview__grid")?.dataset.weeks).toBeUndefined();
    });

    it("blanks hidden outside days", () => {
      const shown = withDisplay({});
      const outsideCount = shown.container.querySelectorAll("[data-outside]").length;
      shown.unmount();

      const { container } = withDisplay({ outsideDays: "hidden" });
      expect(container.querySelector("[data-outside]")).toBeNull();
      const blanks = container.querySelectorAll(".appearance-preview__day--blank");
      expect(outsideCount).toBeGreaterThan(0);
      expect(blanks).toHaveLength(outsideCount);
      for (const blank of blanks) expect(blank.textContent?.trim()).toBe("");
    });

    it("shows inert outside days without the open note's or a control's states", () => {
      const { container } = withDisplay({ outsideDays: "inert" });
      const outside = [...container.querySelectorAll<HTMLElement>('[data-preview-part="date"][data-outside]')];
      expect(outside.length).toBeGreaterThan(0);
      for (const cell of outside) {
        expect(cell.dataset.inactive).toBe("true");
        expect(cell.getAttribute("role")).toBeNull();
      }
    });

    it("pads to six rows", () => {
      const fit = withDisplay({});
      const fitRows = rowsOf(fit.container).length - 1;
      fit.unmount();

      const { container } = withDisplay({ monthRows: "six" });
      expect(fitRows).toBeLessThan(6);
      expect(rowsOf(container).length - 1).toBe(6);
    });
  });

  describe("renders the label formats", () => {
    it("marks the grid for clipping only when the day label is custom", () => {
      expect(withDisplay({}).container.querySelector("[data-custom-day-label]")).toBeNull();
      const custom = withDisplay({ labels: { day: "Do", week: "", month: "", quarter: "", year: "" } }).container;
      expect(custom.querySelector(".appearance-preview")?.hasAttribute("data-custom-day-label")).toBe(true);
    });

    it("renders the day, week and heading labels in the user's formats", () => {
      const { container } = withDisplay({ labels: { day: "DD", week: "w", month: "MM", quarter: "", year: "YY" } });
      const heading = container.querySelector('[data-preview-part="heading"]');

      expect(cellAt(container, "2026-05-01").textContent?.trim()).toBe("01");
      expect(cellAt(container, "2026-05-01").getAttribute("aria-label")).toBe("May 1, 2026");
      expect(container.querySelector(".appearance-preview__week-number")?.textContent?.trim()).toMatch(/^\d+$/);
      expect(
        [...(heading?.querySelectorAll(".notes-calendar-cell") ?? [])].map((cell) => cell.textContent?.trim()),
      ).toEqual(["05", "26"]);
    });

    it("renders each width's weekday text", () => {
      const { container } = withDisplay({
        weekdayLabel: { type: "pattern", pattern: "ddd" },
        weekdayLabelNarrow: { type: "letter" },
      });
      expect(weekdays(container)).toContainEqual({ wide: "Mon", narrow: "M" });
    });

    it("keeps each width's own text when the wide one is one letter", () => {
      const { container } = withDisplay({
        weekdayLabel: { type: "letter" },
        weekdayLabelNarrow: { type: "pattern", pattern: "dd" },
      });
      expect(weekdays(container)).toContainEqual({ wide: "M", narrow: "Mo" });
    });

    it("renders one letter at narrow when the narrow one is unset", () => {
      const { container } = withDisplay({ weekdayLabel: { type: "pattern", pattern: "dd" }, weekdayLabelNarrow: null });
      expect(weekdays(container)).toContainEqual({ wide: "Mo", narrow: "M" });
    });
  });

  it("a click on a day offers Month grid last", () => {
    const { container } = render(AppearancePreview, { props: { width: "wide" } });
    expect(partsAt(cellAt(container, "2026-05-20")).at(-1)).toBe("grid");
    const weekNumber = container.querySelector('[data-preview-part="weekNumber"]');
    if (!weekNumber) throw new Error("no week number");
    expect(partsAt(weekNumber).at(-1)).toBe("grid");
    const heading = container.querySelector('[data-preview-part="heading"] .notes-calendar-cell');
    if (!heading) throw new Error("no heading");
    expect(partsAt(heading)).not.toContain("grid");
  });

  it("sizes the narrow preview to 260px", () => {
    const { container } = render(AppearancePreview, { props: { width: "narrow" } });
    const root = container.querySelector<HTMLElement>(".appearance-preview");
    expect(root?.style.width).toBe("260px");
    expect(root?.style.minWidth).toBe("");
  });

  it("fills the wide preview's container, but no narrower than past the breakpoint", () => {
    const { container } = render(AppearancePreview, { props: { width: "wide" } });
    const root = container.querySelector<HTMLElement>(".appearance-preview");
    expect(root?.style.width).toBe("100%");
    expect(root?.style.minWidth).toBe("30em");
  });
});

const bands = (container: Element, kind: "weekend" | "current-week") =>
  [...container.querySelectorAll<HTMLElement>(`.notes-calendar-band[data-band="${CSS.escape(kind)}"]`)].map((band) => ({
    column: band.style.gridColumn,
    row: band.style.gridRow,
  }));

describe("AppearancePreview bands", () => {
  beforeEach(() => {
    vi.spyOn(CalendarDate, "today").mockReturnValue(date("2026-05-13"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws the weekend band and the current-week band as the month view does, ahead of the rows", () => {
    const { container } = withDisplay({});
    expect({ weekend: bands(container, "weekend"), currentWeek: bands(container, "current-week") }).toEqual({
      weekend: [{ column: "8 / span 2", row: "auto" }],
      currentWeek: [{ column: "1 / -1", row: "4 / span 1" }],
    });
    const children = [...(container.querySelector(".appearance-preview__grid")?.children ?? [])];
    expect(children.slice(0, 2).map((child) => (child as HTMLElement).dataset.band)).toEqual([
      "weekend",
      "current-week",
    ]);
  });

  it("follows the display's weekend, week placement and weekday header", () => {
    const { container } = withDisplay({
      weekend: { type: "custom", days: [5, 6] },
      weekPlacement: "right",
      showWeekdays: false,
    });
    expect({ weekend: bands(container, "weekend"), currentWeek: bands(container, "current-week") }).toEqual({
      weekend: [{ column: "5 / span 2", row: "auto" }],
      currentWeek: [{ column: "1 / -1", row: "3 / span 1" }],
    });
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-preview-part="weekday"]')].map(
        (header) => header.dataset.weekend !== undefined,
      ),
    ).toEqual([false, false, false, false, true, true, false]);
  });

  it("marks today's week number and days with the current week, and the weekend days", () => {
    const { container } = withDisplay({});
    const row = rowsOf(container).at(3);
    expect(row?.querySelectorAll("[data-current-week]").length).toBe(8);
    expect(container.querySelectorAll("[data-current-week]").length).toBe(8);
    expect(cellAt(container, "2026-05-16").dataset.weekend).toBe("true");
    expect(cellAt(container, "2026-05-15").dataset.weekend).toBeUndefined();
  });

  it("shows several states on the selected day: selected, current week and weekend", () => {
    const { container } = withDisplay({});
    const selected = container.querySelector<HTMLElement>("[data-selected]");
    expect({
      weekend: selected?.dataset.weekend,
      currentWeek: selected?.dataset.currentWeek,
    }).toEqual({ weekend: "true", currentWeek: "true" });
  });

  it("draws no weekend band for an empty weekend", () => {
    const { container } = withDisplay({ weekend: { type: "custom", days: [] } });
    expect(bands(container, "weekend")).toEqual([]);
    expect(container.querySelector("[data-weekend]")).toBeNull();
  });
});
