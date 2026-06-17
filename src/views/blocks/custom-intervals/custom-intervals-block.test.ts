import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { customIntervalsBlock } from "./custom-intervals-block";

describe("customIntervalsBlock.summary", () => {
  it("shows the window when no journals are pinned", () => {
    expect(customIntervalsBlock.summary?.({ window: "month", hideEmpty: true })).toBe(
      m.view_block_config_window_current({ period: "month" }),
    );
  });
  it("appends the journal count when journals are pinned", () => {
    const summary = customIntervalsBlock.summary?.({ window: "week", hideEmpty: true, journals: ["a", "b"] });
    expect(summary).toBe(
      `${m.view_block_config_window_current({ period: "week" })} · ${m.view_block_summary_journal_count({ count: 2 })}`,
    );
  });
});
