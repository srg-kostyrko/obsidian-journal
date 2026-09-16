import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { customIntervalsBlock } from "./custom-intervals-block";

describe("customIntervalsBlock.summary", () => {
  it("shows the window when no journals are pinned", () => {
    expect(customIntervalsBlock.summary?.({ window: "month" })).toBe(
      m.view_block_config_window_selected({ period: "month" }),
    );
  });
  it("appends the journal count when journals are pinned", () => {
    const summary = customIntervalsBlock.summary?.({ window: "week", journals: ["a", "b"] });
    expect(summary).toBe(
      `${m.view_block_config_window_selected({ period: "week" })} · ${m.view_block_summary_journal_count({ count: 2 })}`,
    );
  });
  it("reads a window spelled the way an older version stored it", () => {
    // Block configs are persisted unparsed, so the seed written before the rename is still in
    // every vault created then — and a raw "current-month" matches no variant of the message.
    expect(customIntervalsBlock.summary?.({ window: "current-month" })).toBe(
      m.view_block_config_window_selected({ period: "month" }),
    );
  });
});
