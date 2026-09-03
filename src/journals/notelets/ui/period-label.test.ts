import { beforeAll, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { initLocale } from "@/i18n";

import { periodLabelOf } from "./period-label";

describe("periodLabelOf", () => {
  beforeAll(() => initLocale("en"));

  it("names a fixed period by its kind", () => {
    expect(
      periodLabelOf({ start: "2026-08-01" as AnchorString, end: "2026-08-31" as AnchorString, kind: "month" }),
    ).toBe("August 2026");
  });

  it("names a day period in full", () => {
    expect(
      periodLabelOf({ start: "2026-08-12" as AnchorString, end: "2026-08-12" as AnchorString, kind: "day" }),
    ).toContain("2026");
  });

  it("names a kindless period as a date range", () => {
    const label = periodLabelOf({ start: "2026-08-10" as AnchorString, end: "2026-08-23" as AnchorString, kind: null });
    expect(label).toContain("–");
    expect(label).not.toBe("");
  });
});
