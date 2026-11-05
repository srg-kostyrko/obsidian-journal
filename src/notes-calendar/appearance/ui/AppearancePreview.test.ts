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

  it.each([
    ["wide", "640px"],
    ["narrow", "260px"],
  ] as const)("sizes the %s preview to %s", (width, pixels) => {
    const { container } = render(AppearancePreview, { props: { width } });
    const root = container.querySelector<HTMLElement>(".appearance-preview");
    expect(root?.style.width).toBe(pixels);
  });
});
