import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, provide, shallowRef } from "vue";

import type { AnchorString } from "@/calendar";
import { DayPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";

import { buildStyle } from "../testing";

import { CellDecorationMapKey, type CellStyleRef } from "./cell-decoration-map-key";
import CellDecoration from "./CellDecoration.vue";

const slot = () => "hi";

function makeHost(period: DayPeriod, cells: ReadonlyMap<AnchorString, CellStyleRef>) {
  function render() {
    return h(CellDecoration, { period }, slot);
  }
  return defineComponent({
    setup() {
      provide(CellDecorationMapKey, cells);
      return render;
    },
  });
}

describe("CellDecoration", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  it("renders slot content unchanged when no decorations are provided", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const { getByText } = render(CellDecoration, {
      props: { period },
      slots: { default: "Hello" },
    });
    expect(getByText("Hello")).toBeTruthy();
  });

  it("renders a corner decoration when a corner style is provided for the period", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = new Map<AnchorString, CellStyleRef>([
      [period.anchor.toAnchor(), shallowRef([buildStyle("corner", { placement: "top-left" })])],
    ]);

    const { container } = render(makeHost(period, cells));
    expect(container.querySelector(".decoration-corner.top-left")).not.toBeNull();
  });

  it("renders no decorations when the period is absent from the cell map", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = new Map<AnchorString, CellStyleRef>();

    const { container } = render(makeHost(period, cells));
    expect(container.querySelector(".decoration-corner")).toBeNull();
    expect(container.querySelector(".shape-decoration")).toBeNull();
  });
});
