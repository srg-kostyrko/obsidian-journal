import { describe, expect, it } from "vitest";

import type { LogRecord } from "@/infrastructure/logger";

import { formatLogDump } from "./format-dump";

const at = Date.parse("2026-06-04T12:30:00Z");

describe("formatLogDump", () => {
  it("renders a record as one line inside a fenced block", () => {
    const record: LogRecord = { timestamp: at, level: "warn", name: "settings", message: "saved" };
    expect(formatLogDump([record])).toBe(
      ["```", "2026-06-04T12:30:00.000Z [warn] [journals:settings] saved", "```", ""].join("\n"),
    );
  });

  it("tags a root-logger record without a sub-name", () => {
    const record: LogRecord = { timestamp: at, level: "info", name: "", message: "hi" };
    expect(formatLogDump([record])).toContain("[journals] hi");
  });

  it("appends serialized fields when present", () => {
    const record: LogRecord = { timestamp: at, level: "info", name: "", message: "hi", fields: { a: 1 } };
    expect(formatLogDump([record])).toContain('hi {"a":1}');
  });

  it("falls back to a marker when fields cannot be serialized", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const record: LogRecord = { timestamp: at, level: "info", name: "", message: "hi", fields: circular };
    expect(formatLogDump([record])).toContain("hi [unserializable fields]");
  });
});
