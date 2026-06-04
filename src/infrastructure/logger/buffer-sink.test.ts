import { describe, expect, it } from "vitest";

import { BufferSink } from "./buffer-sink";

import type { LogRecord } from "./types";

function record(message: string): LogRecord {
  return { timestamp: 0, level: "info", name: "t", message };
}

describe("BufferSink", () => {
  it("retains written records in order", () => {
    const sink = new BufferSink();
    sink.write(record("a"));
    sink.write(record("b"));
    expect(sink.snapshot().map((r) => r.message)).toEqual(["a", "b"]);
  });

  it("evicts the oldest record once capacity is exceeded", () => {
    const sink = new BufferSink();
    for (let i = 0; i < BufferSink.capacity + 1; i++) sink.write(record(String(i)));
    const snap = sink.snapshot();
    expect(snap).toHaveLength(BufferSink.capacity);
    expect(snap[0]?.message).toBe("1");
  });

  it("returns a snapshot detached from later writes", () => {
    const sink = new BufferSink();
    sink.write(record("a"));
    const snap = sink.snapshot();
    sink.write(record("b"));
    expect(snap).toHaveLength(1);
  });

  it("empties the buffer on clear", () => {
    const sink = new BufferSink();
    sink.write(record("a"));
    sink.clear();
    expect(sink.snapshot()).toHaveLength(0);
  });
});
