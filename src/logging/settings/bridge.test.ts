import { describe, expect, it } from "vitest";
import { nextTick, reactive } from "vue";

import { Container } from "@/infrastructure/di";
import { LogLevelGate, LogLevelGateToken } from "@/infrastructure/logger";
import { SettingsService } from "@/settings";

import { LoggingSettingsBridge } from "./bridge";

import type { LoggingSliceState } from "./slice";

function build(initial: LoggingSliceState["level"]) {
  const state = reactive<LoggingSliceState>({ level: initial });
  const gate = new LogLevelGate("warn");
  const settings = {
    getSlice: () => ({
      get state() {
        return state;
      },
    }),
  };
  const c = new Container();
  c.register(LogLevelGateToken).useValue(gate);
  c.register(SettingsService).useValue(settings as unknown as SettingsService);
  c.register(LoggingSettingsBridge).useClass(LoggingSettingsBridge);
  return { bridge: c.resolve(LoggingSettingsBridge), gate, state };
}

describe("LoggingSettingsBridge", () => {
  it("applies the slice's level to the gate on creation", () => {
    const { gate } = build("debug");
    expect(gate.isEnabled("debug")).toBe(true);
  });

  it("re-applies the gate when the slice level changes", async () => {
    const { gate, state } = build("warn");
    expect(gate.isEnabled("info")).toBe(false);
    state.level = "debug";
    await nextTick();
    expect(gate.isEnabled("info")).toBe(true);
  });
});
