import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { buttonItem } from "./button-item";

describe("buttonItem", () => {
  describe("summary", () => {
    it("names a single-day current button after today", () => {
      expect(buttonItem.summary?.({ action: { type: "current", mode: "create", levels: ["day"] } })).toBe(
        m.common_label_today(),
      );
    });

    it("distinguishes a pick-date button from a today button", () => {
      const today = buttonItem.summary?.({ action: { type: "current", mode: "create", levels: ["day"] } });
      const pick = buttonItem.summary?.({ action: { type: "pick-date", mode: "navigate", levels: ["day"] } });
      expect(pick).not.toBe(today);
    });
  });
});
