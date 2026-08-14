import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { initLocale, m } from "@/i18n";

import { buttonItem } from "./button-item";

describe("buttonItem", () => {
  describe("label", () => {
    beforeAll(() => initLocale("de"));
    afterAll(() => initLocale("en"));

    it("resolves in the locale active when the picker reads it", () => {
      expect(buttonItem.label()).toBe(m.view_toolbar_button_label({}, { locale: "de" }));
    });

    it("resolves a preset label in the locale active when the picker reads it", () => {
      expect(buttonItem.presets?.[0]?.label()).toBe(m.view_toolbar_button_preset_pick_date({}, { locale: "de" }));
    });
  });

  describe("defaultConfig", () => {
    // The module graph — and buttonItem — evaluates before JournalPlugin.onload() calls
    // initLocale(), so a seed captured at module scope would freeze in the base locale. Switching
    // locale only here, after import, reproduces that ordering and proves the seed is deferred.
    beforeAll(() => initLocale("de"));
    afterAll(() => initLocale("en"));

    it("resolves the seeded label in the locale active when the item is created", () => {
      expect(buttonItem.defaultConfig().label).toBe(m.common_label_today({}, { locale: "de" }));
    });

    it("returns a fresh config object on each call", () => {
      expect(buttonItem.defaultConfig()).not.toBe(buttonItem.defaultConfig());
    });
  });

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
