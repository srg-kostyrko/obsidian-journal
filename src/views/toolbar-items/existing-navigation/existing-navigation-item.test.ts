import * as v from "valibot";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { initLocale, m } from "@/i18n";

import { existingNavigationConfigFor, resolveExistingNavigationAppearance } from "./existing-navigation-config";
import { existingNavigationItem } from "./existing-navigation-item";

describe("existingNavigationItem", () => {
  it("defaults to walking daily notes in the next direction", () => {
    expect(existingNavigationItem.defaultConfig()).toEqual(existingNavigationConfigFor("day", "next"));
  });

  describe("locale resolution", () => {
    // The module graph — and existingNavigationItem — evaluates before JournalPlugin.onload()
    // calls initLocale(), so a seed captured at module scope would freeze in the base locale.
    // Switching locale only here, after import, reproduces that ordering and proves the seed is
    // deferred rather than baked in at import time.
    beforeAll(() => initLocale("de"));
    afterAll(() => initLocale("en"));

    it("resolves the seeded tooltip in the locale active when the item is created", () => {
      expect(existingNavigationItem.defaultConfig().tooltip).toBe(m.command_open_next({}, { locale: "de" }));
    });

    it("returns a fresh config object on each call", () => {
      expect(existingNavigationItem.defaultConfig()).not.toBe(existingNavigationItem.defaultConfig());
    });
  });

  it("parses a valid config", () => {
    const result = v.safeParse(existingNavigationItem.schema, { target: "week", direction: "previous" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown target", () => {
    const result = v.safeParse(existingNavigationItem.schema, { target: "decade", direction: "next" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown direction", () => {
    const result = v.safeParse(existingNavigationItem.schema, { target: "day", direction: "sideways" });
    expect(result.success).toBe(false);
  });

  it("parses a config with icon, label, and tooltip", () => {
    const result = v.safeParse(existingNavigationItem.schema, {
      target: "day",
      direction: "next",
      icon: "star",
      label: "Older",
      tooltip: "Jump back",
    });
    expect(result.success).toBe(true);
  });
});

describe("resolveExistingNavigationAppearance", () => {
  it("uses the left chevron and open-previous tooltip for previous", () => {
    expect(resolveExistingNavigationAppearance({ target: "day", direction: "previous" })).toEqual({
      label: "‹",
      tooltip: m.command_open_previous(),
    });
  });

  it("uses the right chevron and open-next tooltip for next", () => {
    expect(resolveExistingNavigationAppearance({ target: "day", direction: "next" })).toEqual({
      label: "›",
      tooltip: m.command_open_next(),
    });
  });
});

describe("existingNavigationConfigFor", () => {
  it("seeds the left chevron label for the previous direction", () => {
    expect(existingNavigationConfigFor("day", "previous").label).toBe("‹");
  });

  it("seeds the right chevron label for the next direction", () => {
    expect(existingNavigationConfigFor("day", "next").label).toBe("›");
  });

  it("seeds the tooltip from the direction", () => {
    expect(existingNavigationConfigFor("day", "next").tooltip).toBe(m.command_open_next());
  });

  it("carries the target it was given", () => {
    expect(existingNavigationConfigFor("week", "next").target).toBe("week");
  });
});
