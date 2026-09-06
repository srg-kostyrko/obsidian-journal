import { fireEvent, screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import NoteletsBlockConfig from "./NoteletsBlockConfig.vue";

import type { NoteletsBlockConfig as Config } from "../notelets-block";

const daily = fixedJournal(
  "Daily",
  { type: "day" },
  {
    notelets: { nt_meeting: buildNoteletType({ id: "nt_meeting" as never, name: "Meeting" }) },
  },
);

const work = fixedJournal(
  "Work",
  { type: "day" },
  {
    notelets: { nt_standup: buildNoteletType({ id: "nt_standup" as never, name: "Standup" }) },
  },
);

const plain = fixedJournal("Plain", { type: "day" });

function qualified(journal: string, type: string): string {
  return m.journal_notelet_list_type_qualified({ journal, type });
}

async function mount(config: Config, journals?: Record<string, ReturnType<typeof fixedJournal>>) {
  const onChange = vi.fn();
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: { journals: journals ?? { Daily: daily } },
  });
  harness.render(NoteletsBlockConfig, { props: { config, onChange } });
  return { onChange };
}

describe("NoteletsBlockConfig", () => {
  beforeAll(async () => {
    const { initLocale } = await import("@/i18n");
    initLocale("en");
  });

  it("offers every window kind", async () => {
    await mount({ window: "day" });
    for (const period of ["day", "week", "month", "quarter", "year"] as const) {
      expect(screen.getByText(m.view_block_config_window_selected({ period }))).toBeTruthy();
    }
  });

  it("reports a changed window", async () => {
    const { onChange } = await mount({ window: "day" });
    await fireEvent.update(screen.getByRole("combobox"), "month");
    expect(onChange).toHaveBeenCalledWith({ window: "month" });
  });

  it("lists every journal's types, journal-qualified", async () => {
    await mount({ window: "day" });
    expect(screen.getByText(m.journal_notelet_list_type_qualified({ journal: "Daily", type: "Meeting" }))).toBeTruthy();
  });

  it("reports a toggled type filter", async () => {
    const { onChange } = await mount({ window: "day" });
    await fireEvent.click(
      screen.getByText(m.journal_notelet_list_type_qualified({ journal: "Daily", type: "Meeting" })),
    );
    expect(onChange).toHaveBeenCalledWith({ window: "day", types: ["nt_meeting"] });
  });

  it("reports a toggled journal filter", async () => {
    const { onChange } = await mount({ window: "day" });
    await fireEvent.click(screen.getByText("Daily"));
    expect(onChange).toHaveBeenCalledWith({ window: "day", journals: ["Daily"] });
  });

  // A journal with no notelet types can never contribute a row to this block, so offering it is
  // a toggle that does nothing.
  it("omits journals that define no notelet type", async () => {
    await mount({ window: "day" }, { Daily: daily, Plain: plain });

    expect(screen.getByText("Daily")).toBeTruthy();
    expect(screen.queryByText("Plain")).toBeNull();
  });

  // The two filters intersect, and the types are journal-qualified, so a type from a journal the
  // block is not scoped to is a selection that can only ever render nothing.
  it("narrows the types on offer to the journals the block is filtered to", async () => {
    await mount({ window: "day", journals: ["Daily"] }, { Daily: daily, Work: work });

    expect(screen.getByText(qualified("Daily", "Meeting"))).toBeTruthy();
    expect(screen.queryByText(qualified("Work", "Standup"))).toBeNull();
  });

  it("offers every journal's types while no journal is picked", async () => {
    await mount({ window: "day" }, { Daily: daily, Work: work });

    expect(screen.getByText(qualified("Daily", "Meeting"))).toBeTruthy();
    expect(screen.getByText(qualified("Work", "Standup"))).toBeTruthy();
  });

  it("drops the type selections the new journal filter no longer offers", async () => {
    const { onChange } = await mount(
      { window: "day", types: ["nt_meeting", "nt_standup"] },
      { Daily: daily, Work: work },
    );

    await fireEvent.click(screen.getByText("Work"));

    expect(onChange).toHaveBeenCalledWith({ window: "day", journals: ["Work"], types: ["nt_standup"] });
  });

  it("keeps every type selection when the journal filter is cleared", async () => {
    const { onChange } = await mount(
      { window: "day", journals: ["Work"], types: ["nt_standup"] },
      { Daily: daily, Work: work },
    );

    await fireEvent.click(screen.getByText("Work"));

    expect(onChange).toHaveBeenCalledWith({ window: "day", types: ["nt_standup"] });
  });

  it("says so when no journal defines a type", async () => {
    await mount({ window: "day" }, { Daily: fixedJournal("Daily", { type: "day" }) });
    expect(screen.getByText(m.view_block_notelets_types_empty())).toBeTruthy();
  });

  it("hides the journals row when no journal defines a type", async () => {
    await mount({ window: "day" }, { Daily: fixedJournal("Daily", { type: "day" }) });
    expect(screen.queryByText(m.view_block_notelets_journals_label())).toBeNull();
  });
});
