import { describe, expect, it } from "vitest";

import { themeColorGroupsFor } from "@/ui/theme-colors";

import { CHIP_ORDER, PARTS, roleFor, visibleControls, type PartKey } from "./appearance-parts";
import { writtenEntryNames } from "./appearance-variables";

const names = (part: PartKey, style?: Parameters<typeof visibleControls>[1]) =>
  visibleControls(part, style).map((control) => control.path.join("."));

describe("PARTS", () => {
  it("every control names a catalog entry the writer produces, and every written entry is reached", () => {
    const written = writtenEntryNames();
    const reached = new Set<string>();
    for (const { controls } of Object.values(PARTS)) {
      for (const control of controls) {
        if (control.entry === undefined) continue;
        expect(written.has(control.entry)).toBe(true);
        reached.add(control.entry);
      }
    }
    expect([...reached].toSorted()).toEqual([...written].toSorted());
  });

  it("gives the style select no variable name", () => {
    expect(PARTS.today.controls.find((control) => control.path[0] === "style")?.entry).toBeUndefined();
  });

  it("orders every part once, most specific first", () => {
    expect(CHIP_ORDER.toSorted()).toEqual(Object.keys(PARTS).toSorted());
    expect(CHIP_ORDER[0]).toBe("active");
  });
});

describe("visibleControls", () => {
  it("none shows only the style", () => {
    expect(names("today", "none")).toEqual(["style"]);
  });

  it("text hides color, ring width, strength and over", () => {
    const shown = names("today", "text");
    for (const hidden of ["color", "ringWidth", "strength", "over"]) expect(shown).not.toContain(hidden);
    expect(shown).toContain("text.color");
  });

  it("ring hides strength", () => {
    const shown = names("today", "ring");
    expect(shown).not.toContain("strength");
    expect(shown).toContain("ringWidth");
  });

  it("background hides ring width", () => {
    const shown = names("today", "background");
    expect(shown).not.toContain("ringWidth");
    expect(shown).toContain("strength");
  });

  it("shows every control of a part with no style", () => {
    expect(visibleControls("cell", undefined)).toBe(PARTS.cell.controls);
  });
});

describe("roleFor", () => {
  const color = PARTS.selected.controls.find((control) => control.path.join(".") === "color");
  const offered = (style: Parameters<typeof roleFor>[1]) =>
    color === undefined ? [] : themeColorGroupsFor(roleFor(color, style)).flatMap((group) => group.names);

  it("offers a ring color the accent and status colors a border reads well in", () => {
    expect(offered("ring")).toContain("text-accent");
  });

  it("keeps a background fill on surface colors", () => {
    expect(offered("background")).not.toContain("text-accent");
  });

  it("leaves a control without a style-dependent role on its own role", () => {
    const text = PARTS.heading.controls.find((control) => control.kind === "color");
    expect(text && roleFor(text, undefined)).toBe("text");
  });
});
