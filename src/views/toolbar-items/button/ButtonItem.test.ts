import userEvent from "@testing-library/user-event";
import { cleanup, render } from "@testing-library/vue";
import { __testing as obsidianTesting } from "obsidian";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, ref } from "vue";

import { CalendarDate, DayPeriod, WeekPeriod } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { AsyncResult, Option } from "@/infrastructure/result";
import { CycleService, OpenDateFlow } from "@/journals";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { buttonItem } from "./button-item";

import type { ButtonConfig } from "./button-config";
import type { BlockInstanceId } from "../../config";

const SCOPE = {
  day: ["daily"] as readonly string[],
  week: ["weekly"] as readonly string[],
  month: ["monthly"] as readonly string[],
  quarter: [] as readonly string[],
  year: [] as readonly string[],
  custom: [] as readonly string[],
};

vi.mock("@/notes-calendar/use-shelf-scope", () => ({
  useShelfScope: () => ({
    all: computed<readonly string[]>(() => [...SCOPE.day, ...SCOPE.week, ...SCOPE.month]),
    day: computed(() => SCOPE.day),
    week: computed(() => SCOPE.week),
    month: computed(() => SCOPE.month),
    quarter: computed(() => SCOPE.quarter),
    year: computed(() => SCOPE.year),
    custom: computed(() => SCOPE.custom),
  }),
}));

class FakeFlows {
  calls: { flow: unknown; parameters: unknown }[] = [];
  invoke(flow: unknown, parameters: unknown) {
    this.calls.push({ flow, parameters });
    return AsyncResult.ok({ path: "x", created: false });
  }
}

class FakeCycle {
  constructor(
    private readonly resolve: (name: string, date: CalendarDate) => Option<AnchorString> = (_name, date) =>
      Option.some(date.toAnchor()),
  ) {}
  anchorOf(name: string, date: CalendarDate): Option<AnchorString> {
    return this.resolve(name, date);
  }
}

const renderRoot = (config: ButtonConfig): ReturnType<typeof h> =>
  h(buttonItem.component, { instanceId: "i-1" as BlockInstanceId, config });

function mountItem(
  config: ButtonConfig,
  contextOverride: Partial<ViewContext> = {},
  cycleResolve?: (name: string, date: CalendarDate) => Option<AnchorString>,
) {
  const container = new Container();
  const flows = new FakeFlows();
  const modals = new FakeModalService();
  const cycle = new FakeCycle(cycleResolve);
  container.register(Flows).useValue(flows as unknown as Flows);
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(CycleService).useValue(cycle as unknown as CycleService);
  const context = provideViewContextStub(contextOverride);
  const wrapperRender = (): ReturnType<typeof h> => renderRoot(config);
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return wrapperRender;
    },
  });
  const result = render(Wrapper, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { result, flows, modals, context };
}

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => cleanup());

describe("ButtonItem", () => {
  describe("rendering defaults", () => {
    it("renders the default 'Today' label for current[day]", () => {
      const { result } = mountItem({ action: { type: "current", mode: "create", levels: ["day"] } });
      expect(result.getByText("Today")).toBeTruthy();
    });

    it("overrides default label with config.label when provided", () => {
      const { result } = mountItem({
        action: { type: "current", mode: "create", levels: ["day"] },
        label: "Right now",
      });
      expect(result.getByText("Right now")).toBeTruthy();
      expect(result.queryByText("Today")).toBeNull();
    });

    it("uses config.tooltip as aria-label when provided", () => {
      const { result } = mountItem({
        action: { type: "current", mode: "create", levels: ["day"] },
        tooltip: "Jump to today",
      });
      expect(result.getByLabelText("Jump to today")).toBeTruthy();
    });
  });

  describe("click — single level", () => {
    it("invokes OpenDateFlow with existingOnly=true when mode is 'navigate'", async () => {
      const { result, flows } = mountItem(
        { action: { type: "current", mode: "navigate", levels: ["day"] } },
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      await userEvent.click(result.getByText("Today"));
      expect(flows.calls).toHaveLength(1);
      expect(flows.calls[0]?.flow).toBe(OpenDateFlow);
      const parameters = flows.calls[0]?.parameters as { existingOnly?: boolean };
      expect(parameters.existingOnly).toBe(true);
    });

    it("invokes OpenDateFlow with existingOnly=false when mode is 'create'", async () => {
      const { result, flows } = mountItem({
        action: { type: "current", mode: "create", levels: ["day"] },
      });
      await userEvent.click(result.getByText("Today"));
      const parameters = flows.calls[0]?.parameters as { existingOnly?: boolean };
      expect(parameters.existingOnly).toBe(false);
    });

    it("recenters the view to today when mode is 'navigate'", async () => {
      const setRefDate = vi.fn();
      const { result } = mountItem(
        { action: { type: "current", mode: "navigate", levels: ["day"] } },
        { refDate: ref("2020-01-01" as AnchorString), setRefDate },
      );
      await userEvent.click(result.getByText("Today"));
      expect(setRefDate).toHaveBeenCalledWith(CalendarDate.today().toAnchor());
    });

    it("calls setRefDate without invoking OpenDateFlow when mode is 'select-only'", async () => {
      const setRefDate = vi.fn();
      const { result, flows } = mountItem(
        { action: { type: "current", mode: "select-only", levels: ["day"] } },
        { setRefDate },
      );
      await userEvent.click(result.getByText("Today"));
      expect(flows.calls).toHaveLength(0);
      expect(setRefDate).toHaveBeenCalledWith(CalendarDate.today().toAnchor());
    });
  });

  describe("click — current uses today, not refDate", () => {
    it("computes the day from CalendarDate.today() and not from refDate", async () => {
      const setRefDate = vi.fn();
      const { result } = mountItem(
        { action: { type: "current", mode: "select-only", levels: ["day"] } },
        { refDate: ref("2020-01-01" as AnchorString), setRefDate },
      );
      await userEvent.click(result.getByText("Today"));
      expect(setRefDate).toHaveBeenCalledWith(CalendarDate.today().toAnchor());
    });
  });

  describe("click — navigate-step", () => {
    it("walks refDate forward by amount×unit, preserving the day within the period", async () => {
      const setRefDate = vi.fn();
      const { result } = mountItem(
        { action: { type: "navigate-step", direction: "next", unit: "month", amount: 2 } },
        { refDate: ref("2026-05-15" as AnchorString), setRefDate },
      );
      // No label; tooltip is rendered as text fallback when there's no label
      await userEvent.click(result.getByRole("button"));
      // refDate 2026-05-15 → +2 months → 2026-07-15 (day kept, not snapped to the month anchor)
      expect(setRefDate).toHaveBeenCalledWith("2026-07-15");
    });

    it("walks refDate backward by amount×unit, preserving the day within the period", async () => {
      const setRefDate = vi.fn();
      const { result } = mountItem(
        { action: { type: "navigate-step", direction: "prev", unit: "week", amount: 1 } },
        { refDate: ref("2026-05-15" as AnchorString), setRefDate },
      );
      await userEvent.click(result.getByRole("button"));
      expect(setRefDate).toHaveBeenCalledWith("2026-05-08");
    });

    it("keeps the displayed month when paging by year", async () => {
      const setRefDate = vi.fn();
      const { result } = mountItem(
        { action: { type: "navigate-step", direction: "next", unit: "year", amount: 1 } },
        { refDate: ref("2026-05-15" as AnchorString), setRefDate },
      );
      await userEvent.click(result.getByRole("button"));
      // +1 year keeps May (2027-05-15); it must not snap to the year anchor (2027-01-01)
      expect(setRefDate).toHaveBeenCalledWith("2027-05-15");
    });
  });

  describe("click — pick-date", () => {
    it("opens the date picker modal with the configured level", async () => {
      const { result, modals } = mountItem({
        action: { type: "pick-date", mode: "navigate", levels: ["day"] },
      });
      await userEvent.click(result.getByRole("button"));
      expect(modals.opens).toHaveLength(1);
      expect((modals.lastOpen().props as { picking: string }).picking).toBe("day");
    });

    it("opens the picker on the currently displayed period with it selected", async () => {
      // v2 passed the calendar's refDate into the picker so it opened where the user
      // is looking, not on today's month.
      const { result, modals } = mountItem(
        { action: { type: "pick-date", mode: "navigate", levels: ["day"] } },
        { refDate: ref("2031-02-14" as AnchorString) },
      );
      await userEvent.click(result.getByRole("button"));
      const selected = (modals.lastOpen().props as { selected?: { anchor: CalendarDate } }).selected;
      expect(selected?.anchor.toAnchor()).toBe("2031-02-14");
    });

    it("dispatches the picked date through OpenDateFlow when mode is 'create'", async () => {
      const { result, modals, flows } = mountItem({
        action: { type: "pick-date", mode: "create", levels: ["day"] },
      });
      await userEvent.click(result.getByRole("button"));
      const picked = DayPeriod.containing(CalendarDate.fromAnchor("2026-06-10" as AnchorString));
      modals.lastOpen().submit(picked);
      await new Promise((r) => window.setTimeout(r, 0));
      expect(flows.calls).toHaveLength(1);
      const parameters = flows.calls[0]?.parameters as { anchor: string; existingOnly?: boolean };
      expect(parameters.anchor).toBe("2026-06-10");
      expect(parameters.existingOnly).toBe(false);
    });
  });

  describe("click — pick-date recenters the view", () => {
    it("recenters to the picked date when mode is 'navigate'", async () => {
      const setRefDate = vi.fn();
      const { result, modals } = mountItem(
        { action: { type: "pick-date", mode: "navigate", levels: ["day"] } },
        { setRefDate },
      );
      await userEvent.click(result.getByRole("button"));
      const picked = DayPeriod.containing(CalendarDate.fromAnchor("2026-06-10" as AnchorString));
      modals.lastOpen().submit(picked);
      await new Promise((r) => window.setTimeout(r, 0));
      expect(setRefDate).toHaveBeenCalledWith("2026-06-10");
    });

    it("recenters to the picked date when mode is 'create'", async () => {
      const setRefDate = vi.fn();
      const { result, modals } = mountItem(
        { action: { type: "pick-date", mode: "create", levels: ["day"] } },
        { setRefDate },
      );
      await userEvent.click(result.getByRole("button"));
      const picked = DayPeriod.containing(CalendarDate.fromAnchor("2026-06-10" as AnchorString));
      modals.lastOpen().submit(picked);
      await new Promise((r) => window.setTimeout(r, 0));
      expect(setRefDate).toHaveBeenCalledWith("2026-06-10");
    });
  });

  describe("click — multi level", () => {
    it("opens an obsidian Menu with one entry per configured level for current", async () => {
      const { result } = mountItem({
        action: { type: "current", mode: "create", levels: ["day", "week", "month"] },
      });
      await userEvent.click(result.getByRole("button"));
      const menu = obsidianTesting.lastOpenMenu();
      expect(menu.items.map((i) => i.title).slice(0, 3)).toEqual(["Today", "This week", "This month"]);
    });

    it("fires the chosen level's action when a menu item is selected", async () => {
      const setRefDate = vi.fn();
      const { result } = mountItem(
        { action: { type: "current", mode: "select-only", levels: ["day", "week"] } },
        { setRefDate },
      );
      await userEvent.click(result.getByRole("button"));
      const menu = obsidianTesting.lastOpenMenu();
      (menu.items[1] as unknown as { click(): void }).click(); // "This week"
      // wait for async fire
      await new Promise((r) => window.setTimeout(r, 0));
      const expected = WeekPeriod.containing(CalendarDate.today()).anchor.toAnchor();
      expect(setRefDate).toHaveBeenCalledWith(expected);
    });
  });

  describe("click — pinned journal", () => {
    it("opens only the pinned journal at its resolved anchor for current", async () => {
      const { result, flows } = mountItem(
        { action: { type: "current", mode: "create", levels: ["day"], journal: "weekly" } },
        {},
        () => Option.some("2026-06-08" as AnchorString),
      );
      await userEvent.click(result.getByText("Today"));
      expect(flows.calls).toHaveLength(1);
      expect(flows.calls[0]?.flow).toBe(OpenDateFlow);
      const parameters = flows.calls[0]?.parameters as { anchor: string; journalNames: string[] };
      expect(parameters.anchor).toBe("2026-06-08");
      expect(parameters.journalNames).toEqual(["weekly"]);
    });

    it("does nothing when the pinned journal cannot be resolved", async () => {
      const { result, flows } = mountItem(
        { action: { type: "current", mode: "create", levels: ["day"], journal: "gone" } },
        {},
        () => Option.none(),
      );
      await userEvent.click(result.getByText("Today"));
      expect(flows.calls).toHaveLength(0);
    });

    it("resolves the picked day through the pinned journal for pick-date", async () => {
      const { result, modals, flows } = mountItem(
        { action: { type: "pick-date", mode: "create", levels: ["day"], journal: "weekly" } },
        {},
        () => Option.some("2026-06-08" as AnchorString),
      );
      await userEvent.click(result.getByRole("button"));
      expect((modals.lastOpen().props as { picking: string }).picking).toBe("day");
      const picked = DayPeriod.containing(CalendarDate.fromAnchor("2026-06-10" as AnchorString));
      modals.lastOpen().submit(picked);
      await new Promise((r) => window.setTimeout(r, 0));
      expect(flows.calls).toHaveLength(1);
      const parameters = flows.calls[0]?.parameters as { anchor: string; journalNames: string[] };
      expect(parameters.anchor).toBe("2026-06-08");
      expect(parameters.journalNames).toEqual(["weekly"]);
    });
  });
});
