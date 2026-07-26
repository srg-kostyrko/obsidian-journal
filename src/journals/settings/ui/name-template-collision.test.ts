import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";

import { findPathCollision } from "./name-template-collision";

describe("findPathCollision", () => {
  it("reports the earliest pair of anchors that render the same path", () => {
    const paths: Record<string, string> = {
      "2026-01-01": "a.md",
      "2026-01-02": "b.md",
      "2026-01-03": "a.md",
    };
    const result = findPathCollision(
      [anchor("2026-01-01"), anchor("2026-01-02"), anchor("2026-01-03")],
      (a) => paths[a],
    );
    expect(result).toEqual({ first: anchor("2026-01-01"), second: anchor("2026-01-03"), path: "a.md" });
  });

  it("returns null when every anchor renders a distinct path", () => {
    const paths: Record<string, string> = {
      "2026-01-01": "a.md",
      "2026-01-02": "b.md",
    };
    const result = findPathCollision([anchor("2026-01-01"), anchor("2026-01-02")], (a) => paths[a]);
    expect(result).toBeNull();
  });

  it("does not match unrenderable anchors against each other", () => {
    const result = findPathCollision([anchor("2026-01-01"), anchor("2026-01-02")], () => undefined);
    expect(result).toBeNull();
  });

  it("returns null for an empty anchor list", () => {
    expect(findPathCollision([], () => "a.md")).toBeNull();
  });
});
