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
      expect(screen.getByText(m.view_block_config_window_current({ period }))).toBeTruthy();
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

  it("says so when no journal defines a type", async () => {
    await mount({ window: "day" }, { Daily: fixedJournal("Daily", { type: "day" }) });
    expect(screen.getByText(m.view_block_notelets_types_empty())).toBeTruthy();
  });
});
