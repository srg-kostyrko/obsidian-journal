import { describe, expect, it } from "vitest";

import { isDone, isExcluded, isOpen } from "./status";

import type { TaskStatus } from "./types";

describe("status aliases", () => {
  it("counts todo, in-progress and on-hold as open", () => {
    expect((["todo", "in-progress", "on-hold"] as TaskStatus[]).every(isOpen)).toBe(true);
  });
  it("counts done and cancelled as done", () => {
    expect((["done", "cancelled"] as TaskStatus[]).every(isDone)).toBe(true);
  });
  it("puts rolled in neither alias", () => {
    expect(isOpen("rolled")).toBe(false);
    expect(isDone("rolled")).toBe(false);
  });
  it("excludes non-task from both", () => {
    expect(isExcluded("non-task")).toBe(true);
    expect(isOpen("non-task")).toBe(false);
    expect(isDone("non-task")).toBe(false);
  });
});
