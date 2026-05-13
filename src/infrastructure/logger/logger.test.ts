import { beforeEach, describe, expect, it, vi } from "vitest";

import { Logger } from "./logger";
import { MemorySink } from "./testing";

import type { LogSink } from "./types";

describe("Logger", () => {
  let sink: MemorySink;

  beforeEach(() => {
    sink = new MemorySink();
  });

  describe("level methods", () => {
    it.each(["debug", "info", "warn", "error"] as const)("%s produces a record with the matching level", (level) => {
      new Logger("svc", [sink])[level]("hello");
      expect(sink.records[0]?.level).toBe(level);
    });
  });

  describe("record shape", () => {
    it("carries the configured logger name", () => {
      new Logger("svc", [sink]).info("hi");
      expect(sink.records[0]?.name).toBe("svc");
    });

    it("passes fields through by identity", () => {
      const fields = { a: 1 };
      new Logger("svc", [sink]).info("hi", fields);
      expect(sink.records[0]?.fields).toBe(fields);
    });

    it("omits fields when no fields argument is given", () => {
      new Logger("svc", [sink]).info("hi");
      expect(sink.records[0]?.fields).toBeUndefined();
    });

    it("stamps the record with the current time", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-13T10:00:00Z"));
      try {
        new Logger("svc", [sink]).info("hi");
        expect(sink.records[0]?.timestamp).toBe(Date.parse("2026-05-13T10:00:00Z"));
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("child", () => {
    it("prepends the parent name with a dot", () => {
      new Logger("a", [sink]).child("b").info("hi");
      expect(sink.records[0]?.name).toBe("a.b");
    });

    it("uses the child name alone when the parent name is empty", () => {
      new Logger("", [sink]).child("b").info("hi");
      expect(sink.records[0]?.name).toBe("b");
    });

    it("shares the parent's sinks", () => {
      new Logger("a", [sink]).child("b").info("hi");
      expect(sink.records).toHaveLength(1);
    });
  });

  describe("sink dispatch", () => {
    it("writes to every registered sink in registration order", () => {
      const a = new MemorySink();
      const b = new MemorySink();
      new Logger("svc", [a, b]).info("hi");
      expect(a.records).toHaveLength(1);
      expect(b.records).toHaveLength(1);
    });

    it("continues to subsequent sinks when an earlier sink throws", () => {
      const throwing: LogSink = {
        write() {
          throw new Error("boom");
        },
      };
      const good = new MemorySink();
      new Logger("svc", [throwing, good]).info("hi");
      expect(good.records).toHaveLength(1);
    });

    it("does not propagate a sink error to the caller", () => {
      const throwing: LogSink = {
        write() {
          throw new Error("boom");
        },
      };
      expect(() => new Logger("svc", [throwing]).info("hi")).not.toThrow();
    });
  });
});
