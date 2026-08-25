import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/vue";
import { __testing as obsidianTesting } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar/types";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { Flows } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsIndex, OpenDateFlow, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { notesCalendarModule } from "@/notes-calendar/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";
import { viewsCoreModule } from "@/views/module";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { periodButtonsItem, type PeriodButtonsConfig } from "./period-buttons-item";

import type { BlockInstanceId } from "../../config";

const MODULES = [
  journalsCoreModule,
  shelvesCoreModule,
  viewsCoreModule,
  decorationsModule,
  decorationsSettingsCoreModule,
  notesCalendarModule,
];

async function mountItem(
  journals: Record<string, JournalConfig>,
  config: PeriodButtonsConfig,
  contextOverride: Partial<ViewContext> = {},
) {
  const harness = await testContainer({ modules: MODULES, data: { journals, views: {} } });
  const flows = vi
    .spyOn(harness.resolve(Flows), "invoke")
    .mockReturnValue(AsyncResult.ok({ path: "x", created: false }));
  const context = provideViewContextStub(contextOverride);
  const wrapperRender = (): ReturnType<typeof h> =>
    h(periodButtonsItem.component, { instanceId: "i-1" as BlockInstanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return wrapperRender;
    },
  });
  const result = harness.render(Wrapper);
  return { harness, ...result, flows };
}

function seedMonthlyNote(harness: TestHarness): void {
  const path = "m/2026-05.md" as VaultPath;
  harness.resolve(JournalsIndex).register({ journalName: "monthly", anchor: "2026-05-01" as AnchorString, path });
  harness.host.putFile(path);
}

function markActive(harness: TestHarness, journalName: string, anchor: string): void {
  const path = `${journalName}/${anchor}.md` as VaultPath;
  harness.resolve(JournalsIndex).register({ journalName, anchor: anchor as AnchorString, path });
  harness.host.emitFileOpen(harness.host.putFile(path));
}

beforeEach(() => obsidianTesting.reset());

describe("PeriodButtonsItem", () => {
  describe("context menu and hover preview", () => {
    it("opens the period note's menu on right-click", async () => {
      const { harness, container } = await mountItem(
        { monthly: fixedJournal("monthly", { type: "month" }) },
        { week: false, month: true, quarter: false, year: false },
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      seedMonthlyNote(harness);

      await fireEvent.contextMenu(container.querySelector("[data-period='month']")!);

      const call = harness.host.workspace.triggerCalls.find((c) => c.event === "file-menu");
      expect((call?.arguments_[1] as { path: string } | undefined)?.path).toBe("m/2026-05.md");
    });

    it("requests the period note's hover preview on modifier hover", async () => {
      const { harness, container } = await mountItem(
        { monthly: fixedJournal("monthly", { type: "month" }) },
        { week: false, month: true, quarter: false, year: false },
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      seedMonthlyNote(harness);

      await fireEvent.mouseEnter(container.querySelector("[data-period='month']")!, { ctrlKey: true });

      const call = harness.host.workspace.triggerCalls.find((c) => c.event === "link-hover");
      expect(call?.arguments_.slice(2)).toEqual(["m/2026-05.md", "m/2026-05.md"]);
    });

    it("contributes the explain item to the context menu of a decorated period", async () => {
      const { container } = await mountItem(
        {
          monthly: fixedJournal(
            "monthly",
            { type: "month" },
            {
              decorations: [
                buildDecoration({ conditions: [buildCondition("date")], styles: [buildStyle("background")] }),
              ],
            },
          ),
        },
        { week: false, month: true, quarter: false, year: false },
        { refDate: ref("2026-05-15" as AnchorString) },
      );

      await fireEvent.contextMenu(container.querySelector("[data-period='month']")!);

      expect(obsidianTesting.lastOpenMenu().items).toHaveLength(1);
    });

    it("contributes no item to the context menu of an undecorated period", async () => {
      const { container } = await mountItem(
        { monthly: fixedJournal("monthly", { type: "month" }) },
        { week: false, month: true, quarter: false, year: false },
        { refDate: ref("2026-05-15" as AnchorString) },
      );

      await fireEvent.contextMenu(container.querySelector("[data-period='month']")!);

      // Neither a note nor a decoration exists for this period, so openPathsMenu's own
      // guard (no paths, no extra items) means no menu opens at all.
      expect(obsidianTesting.openMenus).toHaveLength(0);
    });
  });

  describe("rendering", () => {
    it("renders a journal-less month button rather than hiding it", async () => {
      const { container } = await mountItem({}, { week: false, month: true, quarter: false, year: false });
      expect(container.querySelector("[data-period='month']")).not.toBeNull();
    });

    it("renders a journal-less year button rather than hiding it", async () => {
      const { container } = await mountItem({}, { week: false, month: false, quarter: false, year: true });
      expect(container.querySelector("[data-period='year']")).not.toBeNull();
    });

    it("hides the quarter button when it has no journal", async () => {
      const { container } = await mountItem({}, { week: false, month: false, quarter: true, year: false });
      expect(container.querySelector("[data-period='quarter']")).toBeNull();
    });

    it("renders the quarter button when its scope has a journal", async () => {
      const { container } = await mountItem(
        { quarterly: fixedJournal("quarterly", { type: "quarter" }) },
        { week: false, month: false, quarter: true, year: false },
      );
      expect(container.querySelector("[data-period='quarter']")).not.toBeNull();
    });

    it("does not render periods turned off in config even when scope has journals", async () => {
      const { container } = await mountItem(
        { monthly: fixedJournal("monthly", { type: "month" }) },
        { week: false, month: false, quarter: false, year: false },
      );
      expect(container.querySelectorAll("[data-period]").length).toBe(0);
    });
  });

  describe("active highlighting", () => {
    it("marks the matching badge active when active note's journal + anchor match the period", async () => {
      const { harness, container } = await mountItem(
        { monthly: fixedJournal("monthly", { type: "month" }) },
        { week: false, month: true, quarter: false, year: false },
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      markActive(harness, "monthly", "2026-05-01");
      await nextTick();

      const badge = container.querySelector<HTMLElement>("[data-period='month']");
      expect(badge?.dataset.active).toBe("true");
    });

    it("does not mark active when the active note is in a different journal", async () => {
      const { harness, container } = await mountItem(
        { monthly: fixedJournal("monthly", { type: "month" }) },
        { week: false, month: true, quarter: false, year: false },
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      markActive(harness, "yearly", "2026-05-01");
      await nextTick();

      const badge = container.querySelector<HTMLElement>("[data-period='month']");
      expect(badge?.dataset.active).toBeUndefined();
    });
  });

  describe("click", () => {
    it("invokes OpenDateFlow with the period's journals when a badge is clicked", async () => {
      const { container, flows } = await mountItem(
        { monthly: fixedJournal("monthly", { type: "month" }) },
        { week: false, month: true, quarter: false, year: false },
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      const badge = container.querySelector<HTMLElement>("[data-period='month']");
      expect(badge).not.toBeNull();
      await userEvent.click(badge!);
      expect(flows.mock.calls).toHaveLength(1);
      expect(flows.mock.calls[0]?.[0]).toBe(OpenDateFlow);
      const parameters = flows.mock.calls[0]?.[1] as { anchor: string; journalNames: readonly string[] };
      expect(parameters.anchor).toBe("2026-05-01");
      expect(parameters.journalNames).toEqual(["monthly"]);
    });

    it("does not open anything when a journal-less badge is clicked", async () => {
      const { container, flows } = await mountItem({}, { week: false, month: true, quarter: false, year: false });
      const badge = container.querySelector<HTMLElement>("[data-period='month']");
      expect(badge).not.toBeNull();
      await userEvent.click(badge!);
      expect(flows.mock.calls).toHaveLength(0);
    });
  });
});
