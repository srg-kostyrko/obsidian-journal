import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { LogLevelGateToken } from "@/infrastructure/logger";
import { testContainer } from "@/testing";

import { loggingCoreModule } from "../module";

import { loggingSlice } from "./slice";

describe("LoggingSettingsBridge", () => {
  it("applies the slice's level to the gate on creation", async () => {
    const harness = await testContainer({ modules: [loggingCoreModule], data: { logging: { level: "error" } } });
    expect(harness.resolve(LogLevelGateToken).isEnabled("warn")).toBe(false);
  });

  it("re-applies the gate when the slice level changes", async () => {
    const harness = await testContainer({ modules: [loggingCoreModule], data: { logging: { level: "warn" } } });
    const gate = harness.resolve(LogLevelGateToken);
    expect(gate.isEnabled("info")).toBe(false);
    harness.settings.getSlice(loggingSlice).state.level = "debug";
    await nextTick();
    expect(gate.isEnabled("info")).toBe(true);
  });
});
