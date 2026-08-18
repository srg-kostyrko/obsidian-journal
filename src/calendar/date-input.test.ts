import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseDateExpression } from "./date-input";
import { installTestCalendar } from "./testing";

function parsed(input: string): string | null {
  const result = parseDateExpression(input);
  return result.isSome() ? result.value.toAnchor() : null;
}

describe("parseDateExpression", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });

  afterEach(() => {
    teardown();
  });

  it("parses an absolute anchor", () => {
    expect(parsed("2026-08-18")).toBe("2026-08-18");
  });

  it("treats an empty string and today alike", () => {
    expect(parsed("today")).toBe(parsed(""));
    expect(parsed("today")).not.toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parsed("  2026-08-18  ")).toBe("2026-08-18");
  });

  it("applies a positive relative shift", () => {
    const base = parseDateExpression("today");
    expect(parsed("+1w")).toBe(base.isSome() ? base.value.shift(1, "w").toAnchor() : null);
  });

  it("applies a negative relative shift", () => {
    const base = parseDateExpression("today");
    expect(parsed("-3d")).toBe(base.isSome() ? base.value.shift(-3, "d").toAnchor() : null);
  });

  it("returns none for an expression it cannot parse", () => {
    expect(parsed("next tuesday")).toBeNull();
    expect(parsed("2026-13-45")).toBeNull();
  });
});
