import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { ConsoleSink } from "./console-sink";

import type { LogLevel, LogRecord } from "./types";

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    timestamp: 0,
    level: "info",
    name: "",
    message: "msg",
    ...overrides,
  };
}

describe("ConsoleSink", () => {
  let debugSpy: MockInstance<(typeof console)["debug"]>;
  let infoSpy: MockInstance<(typeof console)["info"]>;
  let warnSpy: MockInstance<(typeof console)["warn"]>;
  let errorSpy: MockInstance<(typeof console)["error"]>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  describe("level dispatch", () => {
    const cases: readonly (readonly [LogLevel, () => MockInstance])[] = [
      ["debug", () => debugSpy],
      ["info", () => infoSpy],
      ["warn", () => warnSpy],
      ["error", () => errorSpy],
    ];

    it.each(cases)("a %s record calls the matching console method", (level, getSpy) => {
      new ConsoleSink().write(makeRecord({ level }));
      expect(getSpy()).toHaveBeenCalledOnce();
    });
  });

  describe("tag prefix", () => {
    it("uses the bare plugin id when the record name is empty", () => {
      new ConsoleSink().write(makeRecord({ name: "" }));
      expect(infoSpy).toHaveBeenCalledWith("[journals]", "msg");
    });

    it("appends the record name with a colon when non-empty", () => {
      new ConsoleSink().write(makeRecord({ name: "calendar.view" }));
      expect(infoSpy).toHaveBeenCalledWith("[journals:calendar.view]", "msg");
    });
  });

  describe("fields argument", () => {
    it("passes fields as a third console argument by identity when present", () => {
      const fields = { path: "x" };
      new ConsoleSink().write(makeRecord({ fields }));
      expect(infoSpy).toHaveBeenCalledWith("[journals]", "msg", fields);
    });

    it("omits the third argument when fields are absent", () => {
      new ConsoleSink().write(makeRecord());
      expect(infoSpy).toHaveBeenCalledWith("[journals]", "msg");
      expect(infoSpy.mock.calls[0]).toHaveLength(2);
    });
  });
});
