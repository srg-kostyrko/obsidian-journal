import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/vue";
import { __testing as obsidianTesting } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { CalendarDate, DayPeriod, WeekPeriod } from "@/calendar";
import { anchor } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { NoApplicableJournals, OpenDateFlow, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";
import { viewsCoreModule } from "@/views/module";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { buttonConfigFor } from "./button-config";
import { buttonItem } from "./button-item";

import type { ButtonConfig } from "./button-config";
import type { BlockInstanceId } from "../../config";

// Mirrors the shelf scope every test in this suite saw under the old `useShelfScope` mock:
// a day, a week and a month journal, nothing for quarter/year.
const JOURNALS: Record<string, JournalConfig> = {
  daily: fixedJournal("daily", { type: "day" }),
  weekly: fixedJournal("weekly", { type: "week" }),
  monthly: fixedJournal("monthly", { type: "month" }),
};

const renderRoot = (config: ButtonConfig): ReturnType<typeof h> =>
  h(buttonItem.component, { instanceId: "i-1" as BlockInstanceId, config });

async function mountItem(config: ButtonConfig, contextOverride: Partial<ViewContext> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: { journals: JOURNALS, views: {} },
  });
  const flows = vi
    .spyOn(harness.resolve(Flows), "invoke")
    .mockReturnValue(AsyncResult.ok({ path: "x", created: false }));
  const context = provideViewContextStub(contextOverride);
  const wrapperRender = (): ReturnType<typeof h> => renderRoot(config);
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return wrapperRender;
    },
  });
  const result = harness.render(Wrapper);
  return { harness, result, flows, modals: harness.modals, notices: harness.notices };
}

afterEach(() => vi.useRealTimers());

describe("ButtonItem", () => {
  describe("rendering", () => {
    it("renders the seeded label for a current[day] button", async () => {
      const { result } = await mountItem(buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }));
      expect(result.getByText("Today")).toBeTruthy();
    });

    it("renders a custom label in place of the seeded one", async () => {
      const { result } = await mountItem({
        ...buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }),
        label: "Right now",
      });
      expect(result.getByText("Right now")).toBeTruthy();
    });

    it("uses the configured tooltip as the button aria-label", async () => {
      const { result } = await mountItem({
        ...buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }),
        tooltip: "Jump to today",
      });
      expect(result.getByLabelText("Jump to today")).toBeTruthy();
    });

    it("omits the aria-label attribute when the tooltip is emptied", async () => {
      const { result } = await mountItem({
        ...buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }),
        tooltip: "",
      });
      expect(result.getByRole("button").getAttribute("aria-label")).toBeNull();
    });

    it("falls back to the tooltip text when the icon is cleared", async () => {
      const { result } = await mountItem({
        ...buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }),
        icon: "",
      });
      expect(result.getByText(m.common_pick_a_date())).toBeTruthy();
    });

    it("shows no text while the seeded icon is present", async () => {
      const { result } = await mountItem(buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }));
      expect(result.queryByText(m.common_pick_a_date())).toBeNull();
    });
  });

  describe("navigate mode with nothing to open", () => {
    it("notices when no note exists at the picked date", async () => {
      const { result, flows, notices } = await mountItem(
        buttonConfigFor({ type: "current", mode: "navigate", levels: ["day"] }),
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      flows.mockReturnValue(AsyncResult.err(new NoApplicableJournals(anchor("2026-05-15"))));

      await userEvent.click(result.getByRole("button"));

      expect(notices.messages).toContain(m.command_open_unavailable());
    });

    it("stays silent in create mode when no journal covers the date", async () => {
      const { result, flows, notices } = await mountItem(
        buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }),
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      flows.mockReturnValue(AsyncResult.err(new NoApplicableJournals(anchor("2026-05-15"))));

      await userEvent.click(result.getByRole("button"));

      expect(notices.messages).toEqual([]);
    });
  });

  describe("click — single level", () => {
    it("invokes OpenDateFlow with existingOnly=true when mode is 'navigate'", async () => {
      const { result, flows } = await mountItem(
        buttonConfigFor({ type: "current", mode: "navigate", levels: ["day"] }),
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      await userEvent.click(result.getByRole("button"));
      expect(flows.mock.calls).toHaveLength(1);
      expect(flows.mock.calls[0]?.[0]).toBe(OpenDateFlow);
      const parameters = flows.mock.calls[0]?.[1] as { existingOnly?: boolean };
      expect(parameters.existingOnly).toBe(true);
    });

    it("invokes OpenDateFlow with existingOnly=false when mode is 'create'", async () => {
      const { result, flows } = await mountItem(buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }));
      await userEvent.click(result.getByRole("button"));
      const parameters = flows.mock.calls[0]?.[1] as { existingOnly?: boolean };
      expect(parameters.existingOnly).toBe(false);
    });

    it("recenters the view to today when mode is 'navigate'", async () => {
      const setRefDate = vi.fn();
      const { result } = await mountItem(buttonConfigFor({ type: "current", mode: "navigate", levels: ["day"] }), {
        refDate: ref("2020-01-01" as AnchorString),
        setRefDate,
      });
      await userEvent.click(result.getByRole("button"));
      expect(setRefDate).toHaveBeenCalledWith(CalendarDate.today().toAnchor());
    });

    it("calls setRefDate without invoking OpenDateFlow when mode is 'select-only'", async () => {
      const setRefDate = vi.fn();
      const { result, flows } = await mountItem(
        buttonConfigFor({ type: "current", mode: "select-only", levels: ["day"] }),
        { setRefDate },
      );
      await userEvent.click(result.getByRole("button"));
      expect(flows.mock.calls).toHaveLength(0);
      expect(setRefDate).toHaveBeenCalledWith(CalendarDate.today().toAnchor());
    });
  });

  describe("click — current uses today, not refDate", () => {
    it("computes the day from CalendarDate.today() and not from refDate", async () => {
      const setRefDate = vi.fn();
      const { result } = await mountItem(buttonConfigFor({ type: "current", mode: "select-only", levels: ["day"] }), {
        refDate: ref("2020-01-01" as AnchorString),
        setRefDate,
      });
      await userEvent.click(result.getByRole("button"));
      expect(setRefDate).toHaveBeenCalledWith(CalendarDate.today().toAnchor());
    });
  });

  describe("click — navigate-step", () => {
    it("walks refDate forward by amount×unit, preserving the day within the period", async () => {
      const setRefDate = vi.fn();
      const { result } = await mountItem(
        buttonConfigFor({ type: "navigate-step", direction: "next", unit: "month", amount: 2 }),
        { refDate: ref("2026-05-15" as AnchorString), setRefDate },
      );
      await userEvent.click(result.getByRole("button"));
      // refDate 2026-05-15 → +2 months → 2026-07-15 (day kept, not snapped to the month anchor)
      expect(setRefDate).toHaveBeenCalledWith("2026-07-15");
    });

    it("walks refDate backward by amount×unit, preserving the day within the period", async () => {
      const setRefDate = vi.fn();
      const { result } = await mountItem(
        buttonConfigFor({ type: "navigate-step", direction: "prev", unit: "week", amount: 1 }),
        { refDate: ref("2026-05-15" as AnchorString), setRefDate },
      );
      await userEvent.click(result.getByRole("button"));
      expect(setRefDate).toHaveBeenCalledWith("2026-05-08");
    });

    it("keeps the displayed month when paging by year", async () => {
      const setRefDate = vi.fn();
      const { result } = await mountItem(
        buttonConfigFor({ type: "navigate-step", direction: "next", unit: "year", amount: 1 }),
        { refDate: ref("2026-05-15" as AnchorString), setRefDate },
      );
      await userEvent.click(result.getByRole("button"));
      // +1 year keeps May (2027-05-15); it must not snap to the year anchor (2027-01-01)
      expect(setRefDate).toHaveBeenCalledWith("2027-05-15");
    });
  });

  describe("click — pick-date", () => {
    it("opens the date picker modal with the configured level", async () => {
      const { result, modals } = await mountItem(
        buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }),
      );
      await userEvent.click(result.getByRole("button"));
      expect(modals.opens).toHaveLength(1);
      expect((modals.lastOpen().props as { picking: string }).picking).toBe("day");
    });

    it("opens the picker on the currently displayed period with it selected", async () => {
      // The picker opens on the currently displayed period, not on today's month, so it
      // matches where the user is looking.
      const { result, modals } = await mountItem(
        buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }),
        { refDate: ref("2031-02-14" as AnchorString) },
      );
      await userEvent.click(result.getByRole("button"));
      const selected = (modals.lastOpen().props as { selected?: { anchor: CalendarDate } }).selected;
      expect(selected?.anchor.toAnchor()).toBe("2031-02-14");
    });

    it("dispatches the picked date through OpenDateFlow when mode is 'create'", async () => {
      const { result, modals, flows } = await mountItem(
        buttonConfigFor({ type: "pick-date", mode: "create", levels: ["day"] }),
      );
      await userEvent.click(result.getByRole("button"));
      const picked = DayPeriod.containing(CalendarDate.fromAnchor("2026-06-10" as AnchorString));
      modals.lastOpen().submit(picked);
      await new Promise((r) => window.setTimeout(r, 0));
      expect(flows.mock.calls).toHaveLength(1);
      const parameters = flows.mock.calls[0]?.[1] as { anchor: string; existingOnly?: boolean };
      expect(parameters.anchor).toBe("2026-06-10");
      expect(parameters.existingOnly).toBe(false);
    });
  });

  describe("click — pick-date recenters the view", () => {
    it("recenters to the picked date when mode is 'navigate'", async () => {
      const setRefDate = vi.fn();
      const { result, modals } = await mountItem(
        buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }),
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
      const { result, modals } = await mountItem(
        buttonConfigFor({ type: "pick-date", mode: "create", levels: ["day"] }),
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
      const { result } = await mountItem(
        buttonConfigFor({ type: "current", mode: "create", levels: ["day", "week", "month"] }),
      );
      await userEvent.click(result.getByRole("button"));
      const menu = obsidianTesting.lastOpenMenu();
      expect(menu.items.map((i) => i.title).slice(0, 3)).toEqual(["Today", "This week", "This month"]);
    });

    it("fires the chosen level's action when a menu item is selected", async () => {
      const setRefDate = vi.fn();
      const { result } = await mountItem(
        buttonConfigFor({ type: "current", mode: "select-only", levels: ["day", "week"] }),
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
      // "weekly" is a real fixed[week] journal (see JOURNALS above); pinning system time inside
      // its 2026-06-08..2026-06-14 week makes CycleService.anchorOf resolve it deterministically,
      // matching the anchor the old fake resolver returned unconditionally.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-10T10:00:00Z"));
      const { result, flows } = await mountItem(
        buttonConfigFor({ type: "current", mode: "create", levels: ["day"], journal: "weekly" }),
      );
      await fireEvent.click(result.getByRole("button"));
      expect(flows.mock.calls).toHaveLength(1);
      expect(flows.mock.calls[0]?.[0]).toBe(OpenDateFlow);
      const parameters = flows.mock.calls[0]?.[1] as { anchor: string; journalNames: string[] };
      expect(parameters.anchor).toBe("2026-06-08");
      expect(parameters.journalNames).toEqual(["weekly"]);
    });

    it("does nothing when the pinned journal cannot be resolved", async () => {
      // "gone" names no seeded journal, so the real CycleService resolves it to None — same
      // outcome the old fake produced by returning Option.none() explicitly.
      const { result, flows } = await mountItem(
        buttonConfigFor({ type: "current", mode: "create", levels: ["day"], journal: "gone" }),
      );
      await userEvent.click(result.getByRole("button"));
      expect(flows.mock.calls).toHaveLength(0);
    });

    it("resolves the picked day through the pinned journal for pick-date", async () => {
      const { result, modals, flows } = await mountItem(
        buttonConfigFor({ type: "pick-date", mode: "create", levels: ["day"], journal: "weekly" }),
      );
      await userEvent.click(result.getByRole("button"));
      expect((modals.lastOpen().props as { picking: string }).picking).toBe("day");
      const picked = DayPeriod.containing(CalendarDate.fromAnchor("2026-06-10" as AnchorString));
      modals.lastOpen().submit(picked);
      await new Promise((r) => window.setTimeout(r, 0));
      expect(flows.mock.calls).toHaveLength(1);
      const parameters = flows.mock.calls[0]?.[1] as { anchor: string; journalNames: string[] };
      // 2026-06-10 falls in the Mon 2026-06-08 – Sun 2026-06-14 week, so the real weekly
      // cycle resolves the same anchor the old fake returned unconditionally.
      expect(parameters.anchor).toBe("2026-06-08");
      expect(parameters.journalNames).toEqual(["weekly"]);
    });
  });
});
