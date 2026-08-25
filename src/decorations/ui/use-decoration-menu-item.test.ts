import { describe, expect, it } from "vitest";
import { defineComponent, h, shallowRef } from "vue";

import { CalendarDate, DayPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import type { MenuItemSpec } from "@/infrastructure/host";
import { testContainer } from "@/testing";
import { icons } from "@/ui/icons";

import { cellKey } from "../engine";
import { buildStyle } from "../testing";

import { decorationCellModal } from "./modals";
import { useDecorationMenuItems } from "./use-decoration-menu-item";

import type { BreakdownEntry } from "./breakdown-entry";
import type { CellStyleRef } from "./cell-decoration-map-key";

function date(s: string): CalendarDate {
  const r = CalendarDate.parse(s);
  if (r.kind === "err") throw new Error(`bad date: ${s}`);
  return r.value;
}

function renderDiv() {
  return h("div");
}

async function mountItems(
  cells: ReadonlyMap<string, CellStyleRef> | null,
  shelf: string | null = null,
): Promise<{
  itemsFor: (entry: BreakdownEntry) => readonly MenuItemSpec[];
  modals: Awaited<ReturnType<typeof testContainer>>["modals"];
}> {
  const harness = await testContainer();

  const captured: { value: ((entry: BreakdownEntry) => readonly MenuItemSpec[]) | null } = { value: null };
  const Host = defineComponent({
    setup() {
      captured.value = useDecorationMenuItems(cells, shelf);
      return renderDiv;
    },
  });
  harness.render(Host);
  if (!captured.value) throw new Error("composable did not run");
  return { itemsFor: captured.value, modals: harness.modals };
}

function cellsWith(period: Period, ref: CellStyleRef): ReadonlyMap<string, CellStyleRef> {
  return new Map([[cellKey(period.kind, period.anchor.toAnchor()), ref]]);
}

describe("useDecorationMenuItems", () => {
  it("contributes no item for a cell with no decorations", async () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = cellsWith(period, shallowRef([]));

    const { itemsFor } = await mountItems(cells);

    expect(itemsFor({ kind: "fixed", period })).toEqual([]);
  });

  it("contributes no item when no cell map was provided", async () => {
    const period = DayPeriod.containing(date("2026-05-25"));

    const { itemsFor } = await mountItems(null);

    expect(itemsFor({ kind: "fixed", period })).toEqual([]);
  });

  it("contributes an item for a cell carrying at least one style", async () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = cellsWith(period, shallowRef([buildStyle("background")]));

    const { itemsFor } = await mountItems(cells);
    const items = itemsFor({ kind: "fixed", period });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ icon: icons.action.search });
  });

  it("opens the cell readout for the clicked cell", async () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = cellsWith(period, shallowRef([buildStyle("background")]));

    const { itemsFor, modals } = await mountItems(cells);
    itemsFor({ kind: "fixed", period })[0].onClick();

    const opened = modals.lastOpen<{ entry: BreakdownEntry }, void>();
    expect(opened.definition).toBe(decorationCellModal);
    expect(opened.props.entry).toEqual({ kind: "fixed", period });
  });

  it("scopes the readout it opens to the surface's shelf", async () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = cellsWith(period, shallowRef([buildStyle("background")]));

    const { itemsFor, modals } = await mountItems(cells, "Work");
    itemsFor({ kind: "fixed", period })[0].onClick();

    expect(modals.lastOpen<{ shelf: string | null }, void>().props.shelf).toBe("Work");
  });

  it("forwards an interval entry unchanged", async () => {
    const period = DayPeriod.containing(date("2026-05-25"));
    const cells = cellsWith(period, shallowRef([buildStyle("background")]));

    const { itemsFor, modals } = await mountItems(cells);
    itemsFor({ kind: "interval", period, journalName: "sprint" })[0].onClick();

    expect(modals.lastOpen<{ entry: BreakdownEntry }, void>().props.entry).toEqual({
      kind: "interval",
      period,
      journalName: "sprint",
    });
  });
});
