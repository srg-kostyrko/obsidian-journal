import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, inject, type PropType } from "vue";

import { CalendarDate, type Period } from "@/calendar";
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

    expect(emitted("pick")).toEqual([[partsAt(today)]]);
    expect(partsAt(today)).toEqual(["selected", "today", "date", "cell"]);
  });

  it.each(["{Enter}", " "])("emits the same parts for %j on a focused cell as for a click", async (key) => {
    const { container, emitted } = render(AppearancePreview, { props: { width: "wide" } });
    const today = cellAt(container, "2026-05-13");

    today.focus();
    await userEvent.keyboard(key);

    expect(emitted("pick")).toEqual([[["selected", "today", "date", "cell"]]]);
  });

  it("marks the open note two days after today", () => {
    const { container } = render(AppearancePreview, { props: { width: "wide" } });
    expect(cellAt(container, "2026-05-15").dataset.active).toBe("true");
    expect(container.querySelectorAll("[data-active]")).toHaveLength(1);
  });

  it("shows outside days as interactive cells", () => {
    const { container } = render(AppearancePreview, { props: { width: "wide" } });
    const outside = container.querySelectorAll<HTMLElement>('[data-preview-part="date"][data-outside]');
    expect(outside.length).toBeGreaterThan(0);
    for (const cell of outside) expect(cell.dataset.inactive).toBeUndefined();
  });

  it("decorates the selected day and one plain day with a background and a text color", () => {
    const { container } = render(AppearancePreview, {
      props: { width: "wide" },
      global: { stubs: { CellDecoration: DecorationProbe } },
    });
    const decorated = [...container.querySelectorAll<HTMLElement>("[data-decoration]")].map((probe) => [
      probe.closest<HTMLElement>(".notes-calendar-cell")?.dataset.anchor,
      probe.dataset.decoration,
    ]);
    expect(decorated).toHaveLength(2);
    expect(decorated).toContainEqual(["2026-05-13", "background,color"]);
    expect(decorated.map(([, styles]) => styles)).toEqual(["background,color", "background,color"]);
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

    it("outlines only the clicked day for a part every day has", async () => {
      const { container } = render(AppearancePreview, { props: { width: "wide", picked: "cell" } });
      expect(picked(container)).toHaveLength(container.querySelectorAll('[data-preview-part="date"]').length);

      await userEvent.click(cellAt(container, "2026-05-20"));

      expect(picked(container)).toEqual([cellAt(container, "2026-05-20")]);
    });

    it("outlines the weekday header row", () => {
      const { container } = render(AppearancePreview, { props: { width: "wide", picked: "weekday" } });
      const outlined = picked(container);
      expect(outlined).toHaveLength(1);
      expect(outlined[0].querySelectorAll('[data-preview-part="weekday"]')).toHaveLength(7);
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
