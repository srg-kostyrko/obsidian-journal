import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";

import { usePeriodWindow } from "./use-period-window";

describe("usePeriodWindow", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("returns the window of months around the focus month", () => {
    const months = usePeriodWindow("month", "2026-03-15" as AnchorString, 1, 1);
    expect(months.value.map((m) => m.start.toAnchor())).toEqual(["2026-02-01", "2026-03-01", "2026-04-01"]);
  });

  it("returns the window of weeks around the focus week", () => {
    const weeks = usePeriodWindow("week", "2026-03-15" as AnchorString, 1, 0);
    expect(weeks.value).toHaveLength(2);
  });

  it("recomputes the window when the ref date changes", () => {
    const refDate = ref("2026-03-15" as AnchorString);
    const months = usePeriodWindow("month", refDate, 0, 0);
    refDate.value = "2026-06-01" as AnchorString;
    expect(months.value.map((m) => m.start.toAnchor())).toEqual(["2026-06-01"]);
  });
});
