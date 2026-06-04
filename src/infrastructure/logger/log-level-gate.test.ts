import { describe, expect, it } from "vitest";

import { LogLevelGate } from "./log-level-gate";

describe("LogLevelGate", () => {
  it("enables a level equal to the threshold", () => {
    expect(new LogLevelGate("warn").isEnabled("warn")).toBe(true);
  });

  it("enables a level above the threshold", () => {
    expect(new LogLevelGate("warn").isEnabled("error")).toBe(true);
  });

  it("disables a level below the threshold", () => {
    expect(new LogLevelGate("warn").isEnabled("info")).toBe(false);
  });

  it("defaults to a warn threshold", () => {
    expect(new LogLevelGate().isEnabled("info")).toBe(false);
  });

  it("applies a new threshold after setThreshold", () => {
    const gate = new LogLevelGate("warn");
    gate.setThreshold("debug");
    expect(gate.isEnabled("debug")).toBe(true);
  });
});
