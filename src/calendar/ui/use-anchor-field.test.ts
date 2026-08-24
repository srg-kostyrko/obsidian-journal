import { describe, expect, it } from "vitest";
import { ref } from "vue";

import { DayPeriod, WeekPeriod, type AnchorString } from "@/calendar";
import { date } from "@/calendar/testing";

import { useAnchorField } from "./use-anchor-field";

describe("useAnchorField", () => {
  describe("getter", () => {
    it("maps an empty anchor to null", () => {
      const anchor = ref<AnchorString>("" as AnchorString);
      const field = useAnchorField({ anchor, picking: "day" });
      expect(field.value).toBeNull();
    });

    it("yields a DayPeriod when picking is day", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "day" });
      expect(field.value?.kind).toBe("day");
    });

    it("yields a WeekPeriod when picking is week", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "week" });
      expect(field.value?.kind).toBe("week");
    });

    it("yields a MonthPeriod when picking is month", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "month" });
      expect(field.value?.kind).toBe("month");
    });

    it("yields a QuarterPeriod when picking is quarter", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "quarter" });
      expect(field.value?.kind).toBe("quarter");
    });

    it("yields a YearPeriod when picking is year", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "year" });
      expect(field.value?.kind).toBe("year");
    });
  });

  describe("setter", () => {
    it("clears the underlying anchor when assigned null", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const field = useAnchorField({ anchor, picking: "day" });
      field.value = null;
      expect(anchor.value).toBe("");
    });

    it("writes period.anchor.toAnchor() to the anchor ref", () => {
      const anchor = ref<AnchorString>("" as AnchorString);
      const field = useAnchorField({ anchor, picking: "day" });
      field.value = DayPeriod.containing(date("2025-03-20"));
      expect(anchor.value).toBe("2025-03-20");
    });
  });

  describe("picking reactivity", () => {
    it("recomputes the period kind when picking changes", () => {
      const anchor = ref<AnchorString>("2025-03-15" as AnchorString);
      const picking = ref<"day" | "week">("day");
      const field = useAnchorField({ anchor, picking });

      expect(field.value?.kind).toBe("day");
      picking.value = "week";
      expect(field.value?.kind).toBe("week");
    });
  });

  describe("cross-year week round-trip", () => {
    it("preserves the stored anchor across read-write cycles for a week spanning year boundary", () => {
      const anchor = ref<AnchorString>("" as AnchorString);
      const field = useAnchorField({ anchor, picking: "week" });

      field.value = WeekPeriod.containing(date("2025-12-30"));
      const stored = anchor.value;

      const reread = ref<AnchorString>(stored);
      const re = useAnchorField({ anchor: reread, picking: "week" });
      expect(re.value?.kind).toBe("week");

      re.value = WeekPeriod.containing(date("2025-12-30"));
      expect(reread.value).toBe(stored);
    });
  });
});
