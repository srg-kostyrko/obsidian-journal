import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, shallowRef } from "vue";

import { CalendarDate, DayPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import type { MenuItemSpec } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { icons } from "@/ui/icons";

import { cellKey } from "../engine";
import { buildStyle } from "../testing";

import { decorationBreakdownModal } from "./modals";
import { useDecorationMenuItems } from "./use-decoration-menu-item";

import type { CellStyleRef } from "./cell-decoration-map-key";

function date(s: string): CalendarDate {
  const r = CalendarDate.parse(s);
  if (r.kind === "err") throw new Error(`bad date: ${s}`);
  return r.value;
}

function renderDiv() {
  return h("div");
}

function mountItems(
  cells: ReadonlyMap<string, CellStyleRef> | null,
  shelf: string | null = null,
): {
  itemsFor: (period: Period) => readonly MenuItemSpec[];
  modals: FakeModalService;
} {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);

  const captured: { value: ((period: Period) => readonly MenuItemSpec[]) | null } = { value: null };
  const Host = defineComponent({
    setup() {
      captured.value = useDecorationMenuItems(cells, shelf);
      return renderDiv;
    },
  });
  render(Host, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
  if (!captured.value) throw new Error("composable did not run");
  return { itemsFor: captured.value, modals };
}

function cellsWith(period: Period, ref: CellStyleRef): ReadonlyMap<string, CellStyleRef> {
  return new Map([[cellKey(period.kind, period.anchor.toAnchor()), ref]]);
}

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  teardown();
  cleanup();
});

describe("useDecorationMenuItems", () => {
  it("contributes no item for a cell with no decorations", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = cellsWith(period, shallowRef([]));

    const { itemsFor } = mountItems(cells);

    expect(itemsFor(period)).toEqual([]);
  });

  it("contributes no item when no cell map was provided", () => {
    const period = DayPeriod.containing(date("2026-05-25"));

    const { itemsFor } = mountItems(null);

    expect(itemsFor(period)).toEqual([]);
  });

  it("contributes an item for a cell carrying at least one style", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = cellsWith(period, shallowRef([buildStyle("background")]));

    const { itemsFor } = mountItems(cells);
    const items = itemsFor(period);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ icon: icons.action.search });
  });

  it("opens the breakdown modal for the clicked cell's period", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = cellsWith(period, shallowRef([buildStyle("background")]));

    const { itemsFor, modals } = mountItems(cells);
    const items = itemsFor(period);
    items[0].onClick();

    const opened = modals.lastOpen<{ period: Period }, void>();
    expect(opened.definition).toBe(decorationBreakdownModal);
    expect(opened.props.period).toBe(period);
  });

  it("scopes the breakdown it opens to the surface's shelf", () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = cellsWith(period, shallowRef([buildStyle("background")]));

    const { itemsFor, modals } = mountItems(cells, "Work");
    itemsFor(period)[0].onClick();

    expect(modals.lastOpen<{ shelf: string | null }, void>().props.shelf).toBe("Work");
  });
});
