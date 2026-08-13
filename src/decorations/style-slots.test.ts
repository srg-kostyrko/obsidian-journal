import { describe, expect, it } from "vitest";

import { defaultStyle } from "./defaults";
import { occupiedSlots, slotIndex, slotOf } from "./style-slots";

import type { JournalDecorationStyle } from "./config";

describe("slotIndex", () => {
  it("finds the position of a style by its type", () => {
    const styles: JournalDecorationStyle[] = [defaultStyle("background"), defaultStyle("shape")];
    expect(slotIndex(styles, "shape")).toBe(1);
  });

  it("reports an absent type as -1", () => {
    expect(slotIndex([defaultStyle("background")], "icon")).toBe(-1);
  });

  // Unreachable from the editor, but a hand-edited data.json can hold duplicates.
  // The cascade resolves exclusive properties last-wins, so the editor agrees with it.
  it("resolves a duplicated type to the last occurrence", () => {
    const styles: JournalDecorationStyle[] = [
      { ...defaultStyle("corner"), placement: "top-left" },
      { ...defaultStyle("corner"), placement: "bottom-right" },
    ];
    expect(slotIndex(styles, "corner")).toBe(1);
  });
});

describe("slotOf", () => {
  it("returns the style occupying a slot", () => {
    const shape = defaultStyle("shape");
    expect(slotOf([defaultStyle("background"), shape], "shape")).toBe(shape);
  });

  it("returns undefined for an empty slot", () => {
    expect(slotOf([], "border")).toBeUndefined();
  });
});

describe("occupiedSlots", () => {
  it("reports every type present", () => {
    const styles = [defaultStyle("background"), defaultStyle("icon")];
    expect(occupiedSlots(styles)).toEqual(new Set(["background", "icon"]));
  });
});
