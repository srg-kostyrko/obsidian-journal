import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, inject, type PropType } from "vue";

import { CalendarDate, calendarDisplaySlice, type CalendarDisplaySliceState, type Period } from "@/calendar";
import { date } from "@/calendar/testing";
import { cellKey } from "@/decorations/engine";
import { CellDecorationMapKey } from "@/decorations/ui/cell-decoration-map-key";

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
        { "data-decoration": styles.length > 0 ? styles.map((style) => style.type).join(",") : undefined },
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
    expect(partsAt(today)).toEqual(["today", "date", "cell", "grid"]);
  });

  it.each(["{Enter}", " "])("emits the same parts for %j on a focused cell as for a click", async (key) => {
    const { container, emitted } = render(AppearancePreview, { props: { width: "wide" } });
    const today = cellAt(container, "2026-05-13");

    today.focus();
    await userEvent.keyboard(key);

    expect(emitted("pick")).toEqual([[["today", "date", "cell", "grid"], "2026-05-13"]]);
  });

  it("marks the open note two days after today, unselected", () => {
    const { container } = render(AppearancePreview, { props: { width: "wide" } });
    const open = cellAt(container, "2026-05-15");
    expect(open.dataset.active).toBe("true");
    expect(open.dataset.selected).toBeUndefined();
    expect(container.querySelectorAll("[data-active]")).toHaveLength(1);
  });

  it("selects the month's first day, which is not the open note's", () => {
    const { container } = render(AppearancePreview, { props: { width: "wide" } });
    const selected = cellAt(container, "2026-05-01");
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
    expect(anchor).toBe("2026-05-01");
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

    it("outlines every week number", () => {
      const { container } = render(AppearancePreview, { props: { width: "wide", picked: "weekNumber" } });
      const weekNumbers = [...container.querySelectorAll<HTMLElement>('[data-preview-part="weekNumber"]')];
      expect(weekNumbers.length).toBeGreaterThan(3);
      expect(picked(container)).toEqual(weekNumbers);
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
