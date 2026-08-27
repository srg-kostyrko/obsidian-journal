import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { LoggerFactoryToken } from "./factory";
import { LogLevelGate, LogLevelGateToken } from "./log-level-gate";
import { createLoggerTestingModule } from "./testing";

describe("createLoggerTestingModule", () => {
  it("defaults the gate to production's warn threshold", () => {
    const { module, sink } = createLoggerTestingModule();
    const c = new Container();
    c.addModule(module);
    const logger = c.resolve(LoggerFactoryToken).named("svc");

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");

    expect(sink.records.map((record) => record.level)).toEqual(["warn"]);
  });

  it("filters a record below a seeded narrower level", () => {
    const { module, sink } = createLoggerTestingModule();
    const c = new Container();
    c.addModule(module);
    c.override(LogLevelGateToken).useValue(new LogLevelGate("error"));
    const logger = c.resolve(LoggerFactoryToken).named("svc");

    logger.warn("warn message");
    logger.error("error message");

    expect(sink.records.map((record) => record.level)).toEqual(["error"]);
  });
});
