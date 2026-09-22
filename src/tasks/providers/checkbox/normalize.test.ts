import { describe, expect, it } from "vitest";

import { normalizeStatus } from "./normalize";
import { DEFAULT_STATUS_MAP } from "./slice";

describe("normalizeStatus", () => {
  it("maps the shipped five", () => {
    expect(normalizeStatus(" ", DEFAULT_STATUS_MAP)).toBe("todo");
    expect(normalizeStatus("x", DEFAULT_STATUS_MAP)).toBe("done");
    expect(normalizeStatus("X", DEFAULT_STATUS_MAP)).toBe("done");
    expect(normalizeStatus("/", DEFAULT_STATUS_MAP)).toBe("in-progress");
    expect(normalizeStatus("-", DEFAULT_STATUS_MAP)).toBe("cancelled");
  });
  it("maps an unknown symbol to todo", () => {
    expect(normalizeStatus("!", DEFAULT_STATUS_MAP)).toBe("todo");
    expect(normalizeStatus(">", DEFAULT_STATUS_MAP)).toBe("todo");
  });
  it("maps an unrecognised stored type name to todo rather than throwing", () => {
    expect(normalizeStatus("q", { q: "banana" })).toBe("todo");
  });
  it("honours a user mapping a symbol to rolled", () => {
    expect(normalizeStatus(">", { ">": "rolled" })).toBe("rolled");
  });
});
