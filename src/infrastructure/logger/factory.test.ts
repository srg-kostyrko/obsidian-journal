import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { LoggerFactory, LoggerFactoryToken } from "./factory";
import { MemorySink } from "./testing";
import { LogSinkMultiToken } from "./types";

describe("LoggerFactory", () => {
  it("creates a Logger with the given name that emits to the injected sinks", () => {
    const sink = new MemorySink();
    const c = new Container();
    c.register(LogSinkMultiToken).useValue(sink);
    c.register(LoggerFactoryToken).useClass(LoggerFactory);

    c.resolve(LoggerFactoryToken).named("svc").info("hi");

    expect(sink.records[0]?.name).toBe("svc");
  });
});
