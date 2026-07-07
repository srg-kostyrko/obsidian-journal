import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { definedNavigationItem, resolveDefinedNavigationAppearance } from "./defined-navigation-item";

describe("definedNavigationItem", () => {
  it("defaults to walking daily notes in the next direction", () => {
    expect(definedNavigationItem.defaultConfig).toEqual({ target: "day", direction: "next" });
  });

  it("parses a valid config", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "week", direction: "previous" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown target", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "decade", direction: "next" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown direction", () => {
    const result = v.safeParse(definedNavigationItem.schema, { target: "day", direction: "sideways" });
    expect(result.success).toBe(false);
  });

  it("parses a config with icon, label, and tooltip", () => {
    const result = v.safeParse(definedNavigationItem.schema, {
      target: "day",
      direction: "next",
      icon: "star",
      label: "Older",
      tooltip: "Jump back",
    });
    expect(result.success).toBe(true);
  });
});

describe("resolveDefinedNavigationAppearance", () => {
  it("uses the left chevron and open-previous tooltip for previous", () => {
    expect(resolveDefinedNavigationAppearance({ target: "day", direction: "previous" })).toEqual({
      label: "‹",
      tooltip: m.command_open_previous(),
    });
  });

  it("uses the right chevron and open-next tooltip for next", () => {
    expect(resolveDefinedNavigationAppearance({ target: "day", direction: "next" })).toEqual({
      label: "›",
      tooltip: m.command_open_next(),
    });
  });
});
