import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, h, provide, reactive, ref, shallowRef } from "vue";

import { DayPeriod } from "@/calendar";
import { date } from "@/calendar/testing";

import { cellKey } from "../engine";
import { buildStyle } from "../testing";

import { CellDecorationMapKey, CellMarkLimitKey, type CellStyleRef } from "./cell-decoration-map-key";
import CellDecoration from "./CellDecoration.vue";

const slot = () => "hi";

function makeHost(period: DayPeriod, cells: ReadonlyMap<string, CellStyleRef>, limit?: number) {
  function render() {
    return h(CellDecoration, { period }, slot);
  }
  return defineComponent({
    setup() {
      provide(CellDecorationMapKey, cells);
      if (limit !== undefined) provide(CellMarkLimitKey, ref(limit));
      return render;
    },
  });
}

describe("CellDecoration", () => {
  it("renders slot content unchanged when no decorations are provided", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    render(CellDecoration, {
      props: { period },
      slots: { default: "Hello" },
    });
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("renders a corner decoration when a corner style is provided for the period", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = new Map<string, CellStyleRef>([
      [cellKey(period.kind, period.anchor.toAnchor()), shallowRef([buildStyle("corner", { placement: "top-left" })])],
    ]);

    const { container } = render(makeHost(period, cells));
    expect(container.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });

  it("renders no decorations when the period is absent from the cell map", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = new Map<string, CellStyleRef>();

    const { container } = render(makeHost(period, cells));
    expect(container.querySelector(".decoration-corner")).toBeNull();
    expect(container.querySelector(".shape-decoration")).toBeNull();
  });

  it("honours an injected mark limit, collapsing overflow into a badge", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const shapes = Array.from({ length: 5 }, () => buildStyle("shape", { placement_x: "right", placement_y: "top" }));
    const cells = new Map<string, CellStyleRef>([[cellKey(period.kind, period.anchor.toAnchor()), shallowRef(shapes)]]);

    const { container } = render(makeHost(period, cells, 3));

    expect(container.querySelectorAll(".place-right_top .shape-decoration")).toHaveLength(2);
    expect(screen.getByTestId("mark-overflow")).not.toBeNull();
  });

  it("renders every mark when no limit is injected", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const shapes = Array.from({ length: 5 }, () => buildStyle("shape", { placement_x: "right", placement_y: "top" }));
    const cells = new Map<string, CellStyleRef>([[cellKey(period.kind, period.anchor.toAnchor()), shallowRef(shapes)]]);

    const { container } = render(makeHost(period, cells));

    expect(container.querySelectorAll(".place-right_top .shape-decoration")).toHaveLength(5);
    expect(screen.queryByTestId("mark-overflow")).toBeNull();
  });

  it("renders when the period prop arrives as a reactive proxy", () => {
    // A caller that stores its periods in a reactive array (rather than a shallowRef) hands
    // this component a reactive-wrapped Period. cells is null here (no provide), so `cells?.get(...)`
    // never evaluates its argument — the only reason a reactive CalendarDate never reaches `.toAnchor()`.
    const period = reactive(DayPeriod.containing(date("2026-05-25")));
    expect(() => render(CellDecoration, { props: { period } })).not.toThrow();
  });
});
