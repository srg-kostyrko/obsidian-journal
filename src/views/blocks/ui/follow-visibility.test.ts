import { beforeAll, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";

import { monthWindowContains, spanContains, weekWindowContains } from "./follow-visibility";

const a = (s: string): AnchorString => s as AnchorString;

beforeAll(() => {
  installTestCalendar();
});

describe("spanContains", () => {
  it("includes a date on the start boundary", () => {
    expect(spanContains(a("2026-05-01"), a("2026-05-01"), a("2026-05-31"))).toBe(true);
  });

  it("includes a date on the end boundary", () => {
    expect(spanContains(a("2026-05-31"), a("2026-05-01"), a("2026-05-31"))).toBe(true);
  });

  it("excludes a date after the end boundary", () => {
    expect(spanContains(a("2026-06-01"), a("2026-05-01"), a("2026-05-31"))).toBe(false);
  });
});

describe("monthWindowContains", () => {
  it("includes a day inside the single focus month", () => {
    expect(monthWindowContains(a("2026-05-20"), a("2026-05-15"), 0, 0)).toBe(true);
  });

  it("excludes a day in a month outside the window", () => {
    expect(monthWindowContains(a("2026-09-10"), a("2026-05-15"), 0, 0)).toBe(false);
  });

  it("excludes a spillover day of an adjacent month the grid only paints", () => {
    // The May 2026 grid renders the trailing days of April in its first week, but April is
    // not a month this window displays.
    expect(monthWindowContains(a("2026-04-30"), a("2026-05-15"), 0, 0)).toBe(false);
  });

  it("includes a day of an adjacent month the window itself displays", () => {
    expect(monthWindowContains(a("2026-04-30"), a("2026-05-15"), 1, 0)).toBe(true);
  });
});

describe("weekWindowContains", () => {
  it("includes a day inside the focus week", () => {
    expect(weekWindowContains(a("2026-05-15"), a("2026-05-15"), 0, 0)).toBe(true);
  });

  it("excludes a day two weeks away with no padding", () => {
    expect(weekWindowContains(a("2026-05-29"), a("2026-05-15"), 0, 0)).toBe(false);
  });
});
