import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, OpenDateFlow, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import type { ShelfConfig } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import HomeCodeBlock from "./HomeCodeBlock.vue";

import type { HomeBlockConfig } from "../home-config";

async function mount(
  journals: Record<string, JournalConfig>,
  config: HomeBlockConfig,
  shelves: Record<string, ShelfConfig> = {},
) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { journals, shelves },
  });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  harness.render(HomeCodeBlock, { props: { path: "Note.md" as VaultPath, config } });
  return { harness, flows };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("HomeCodeBlock", () => {
  it("renders no links when no journals match the configured entries", async () => {
    await mount({}, { show: ["day"], separator: " • ", scale: 1 });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("explains itself when no journals match the configured entries", async () => {
    await mount({}, { show: ["day"], separator: " • ", scale: 1 });
    expect(screen.getByText(m.code_blocks_home_empty())).toBeTruthy();
  });

  it("does not show the empty message when a journal matches", async () => {
    await mount({ Daily: fixedJournal("Daily", { type: "day" }) }, { show: ["day"], separator: " • ", scale: 1 });
    expect(screen.queryByText(m.code_blocks_home_empty())).toBeNull();
  });

  it("treats an empty shelf as unset so journals still render", async () => {
    // shelf: "" must mean "current shelf" (here none → all journals), not a literal shelf "".
    await mount(
      { Daily: fixedJournal("Daily", { type: "day" }) },
      { show: ["day"], separator: " • ", scale: 1, shelf: "" },
    );
    expect(screen.getByRole("link").textContent).toBe("Today");
  });

  it("renders one link with the relative day label for a matching daily journal", async () => {
    await mount({ Daily: fixedJournal("Daily", { type: "day" }) }, { show: ["day"], separator: " • ", scale: 1 });
    expect(screen.getByRole("link").textContent).toBe("Today");
  });

  it("inserts a separator span between items but not before the first", async () => {
    await mount(
      { Daily: fixedJournal("Daily", { type: "day" }), Weekly: fixedJournal("Weekly", { type: "week" }) },
      { show: ["day", "week"], separator: " | ", scale: 1 },
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    const separators = document.querySelectorAll(".home-code-block__separator");
    expect(separators).toHaveLength(1);
    expect(separators[0]?.textContent).toBe(" | ");
  });

  it("renders the resolved index for a custom journal whose name template uses {{index}}", async () => {
    await mount(
      { Sprint: customJournal("Sprint", "week", 1, "2026-05-27", { nameTemplate: "Sprint {{index}}" }) },
      { show: ["custom"], separator: " • ", scale: 1 },
    );
    expect(screen.getByRole("link").textContent).toBe("Sprint 1");
  });

  it("invokes OpenDateFlow with the item's journal names and today's anchor on click", async () => {
    const { flows } = await mount(
      { Daily: fixedJournal("Daily", { type: "day" }) },
      { show: ["day"], separator: " • ", scale: 1 },
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("link"));

    expect(flows.invoke).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ anchor: "2026-05-27", journalNames: ["Daily"] }),
    );
  });

  it("narrows to the host note's shelf when the index registers it after mount", async () => {
    const { harness, flows } = await mount(
      { Daily: fixedJournal("Daily", { type: "day" }), Personal: fixedJournal("Personal", { type: "day" }) },
      { show: ["day"], separator: " • ", scale: 1 },
      { work: buildShelf("work", { journals: ["Daily"] }), home: buildShelf("home", { journals: ["Personal"] }) },
    );

    harness.resolve(JournalsIndex).register({
      journalName: "Daily",
      anchor: anchor("2026-05-27"),
      path: "Note.md" as VaultPath,
    });
    await nextTick();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("link"));

    expect(flows.invoke).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ journalNames: ["Daily"] }));
  });

  it("asks the journal picker to open at the pointer rather than center-screen", async () => {
    const { flows } = await mount(
      { Daily: fixedJournal("Daily", { type: "day" }), Work: fixedJournal("Work", { type: "day" }) },
      { show: ["day"], separator: " • ", scale: 1 },
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getAllByRole("link")[0]);

    expect(flows.invoke).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ pickAt: expect.any(MouseEvent) as MouseEvent }),
    );
  });
});
