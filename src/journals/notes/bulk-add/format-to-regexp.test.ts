import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";

import { formatToRegexp } from "./format-to-regexp";

describe("formatToRegexp", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => teardown());

  it("matches an ISO date embedded in a longer title", () => {
    const re = formatToRegexp("YYYY-MM-DD");
    const match = "Daily note 2026-06-01 draft".match(re);
    expect(match?.[0]).toBe("2026-06-01");
  });

  it("matches a date with literal text in the format", () => {
    const re = formatToRegexp("[Week] YYYY-MM-DD");
    const match = "Week 2026-06-01".match(re);
    expect(match?.[0]).toBe("Week 2026-06-01");
  });

  it("does not match a string with no date", () => {
    const re = formatToRegexp("YYYY-MM-DD");
    expect("no date here".match(re)).toBeNull();
  });
});
