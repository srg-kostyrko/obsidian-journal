import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { defineViewBlock } from "./define-view-block";

const renderNothing = () => null;

describe("defineViewBlock summary", () => {
  const block = defineViewBlock<{ count: number; label: string }>({
    key: "summary-block",
    label: () => "Summary",
    schema: v.object({ count: v.number(), label: v.string() }),
    defaultConfig: { count: 3, label: "default" },
    component: { setup: () => renderNothing },
    summary: (config) => `${config.label} × ${config.count}`,
  });

  it("summary reads a repaired config", () => {
    expect(block.summary?.({ count: "many", label: "kept" })).toBe("kept × 3");
  });

  it("summary is undefined for a config the repair cannot make valid", () => {
    expect(block.summary?.("not an object")).toBeUndefined();
  });
});
