import { describe, expect, it } from "vitest";

import {
  fromControlValue,
  isModified,
  sourceAt,
  toControlValue,
  valueAt,
  withNarrowCleared,
  withReset,
  withValue,
} from "./appearance-editing";
import { PARTS, type Control } from "./appearance-parts";
import { appearanceSlice } from "./slice";

const fresh = () => structuredClone(appearanceSlice.defaults);
const custom = (hex: string) => ({ type: "custom" as const, color: hex });
const TEXT_COLOR = ["text", "color"];

describe("valueAt", () => {
  it("at narrow merges the narrow leaf over the wide value", () => {
    const wide = withValue(fresh(), "wide", "today", TEXT_COLOR, custom("#111111"));
    expect(valueAt(wide, "narrow", "today", TEXT_COLOR)).toEqual(custom("#111111"));
    const narrow = withValue(wide, "narrow", "today", TEXT_COLOR, custom("#222222"));
    expect(valueAt(narrow, "narrow", "today", TEXT_COLOR)).toEqual(custom("#222222"));
    expect(valueAt(narrow, "wide", "today", TEXT_COLOR)).toEqual(custom("#111111"));
  });
});

describe("withValue", () => {
  it("at narrow writes only the narrow leaf", () => {
    const base = fresh();
    const next = withValue(base, "narrow", "today", TEXT_COLOR, custom("#222222"));
    expect(next.wide.today).toEqual(base.wide.today);
    expect(next.narrow.today.text.color).toEqual(custom("#222222"));
    expect(base.narrow.today.text.color).toBeNull();
  });
});

describe("withNarrowCleared", () => {
  it("clears exactly one leaf", () => {
    let state = withValue(fresh(), "narrow", "cell", ["padding"], 4);
    state = withValue(state, "narrow", "cell", ["gap"], "2px");
    state = withNarrowCleared(state, "cell", ["padding"]);
    expect(state.narrow.cell.padding).toBeNull();
    expect(state.narrow.cell.gap).toBe("2px");
  });
});

describe("withReset", () => {
  it("at wide keeps narrow overrides, and at narrow keeps wide values", () => {
    let state = withValue(fresh(), "wide", "cell", ["padding"], 5);
    state = withValue(state, "narrow", "cell", ["gap"], "2px");
    const wideReset = withReset(state, "wide", "cell");
    expect(wideReset.wide.cell).toEqual(appearanceSlice.defaults.wide.cell);
    expect(wideReset.narrow.cell.gap).toBe("2px");
    const narrowReset = withReset(state, "narrow", "cell");
    expect(narrowReset.narrow.cell.gap).toBeNull();
    expect(narrowReset.wide.cell.padding).toBe(5);
  });

  it("restores a theme-expression stock", () => {
    const written = withValue(fresh(), "wide", "cell", ["radius"], "4px");
    expect(valueAt(written, "wide", "cell", ["radius"])).toBe("4px");
    expect(valueAt(withReset(written, "wide", "cell"), "wide", "cell", ["radius"])).toBe("var(--radius-s)");
  });
});

describe("style round trip", () => {
  it("keeps hidden values", () => {
    let state = withValue(fresh(), "wide", "today", ["style"], "ring");
    state = withValue(state, "wide", "today", ["ringWidth"], 3);
    state = withValue(state, "wide", "today", ["style"], "background");
    state = withValue(state, "wide", "today", ["style"], "ring");
    expect(valueAt(state, "wide", "today", ["ringWidth"])).toBe(3);
  });
});

describe("isModified", () => {
  it("is false for defaults at both widths and true after any withValue", () => {
    const base = fresh();
    expect(isModified(base, "wide", "cell")).toBe(false);
    expect(isModified(base, "narrow", "cell")).toBe(false);
    expect(isModified(withValue(base, "wide", "cell", ["padding"], 2), "wide", "cell")).toBe(true);
    expect(isModified(withValue(base, "narrow", "today", TEXT_COLOR, custom("#222222")), "narrow", "today")).toBe(true);
  });
});

describe("sourceAt", () => {
  it("reports stock, user and narrow", () => {
    const base = fresh();
    expect(sourceAt(base, "narrow", "cell", ["padding"])).toBe("stock");
    const user = withValue(base, "wide", "cell", ["padding"], 2);
    expect(sourceAt(user, "wide", "cell", ["padding"])).toBe("user");
    expect(sourceAt(user, "narrow", "cell", ["padding"])).toBe("user");
    expect(sourceAt(withValue(user, "narrow", "cell", ["padding"], 3), "narrow", "cell", ["padding"])).toBe("narrow");
  });
});

describe("sourceAt with an absent narrow key", () => {
  it("is not narrow", () => {
    const state = fresh();
    Reflect.deleteProperty(state.narrow.cell, "padding");
    expect(sourceAt(state, "narrow", "cell", ["padding"])).toBe("stock");
  });
});

const control = (part: keyof typeof PARTS, ...path: string[]): Control => {
  const found = PARTS[part].controls.find((candidate) => candidate.path.join(".") === path.join("."));
  if (!found) throw new Error(`no control ${path.join(".")}`);
  return found;
};

describe("control values", () => {
  it("maps italic and over to their option names", () => {
    const italic = control("heading", "italic");
    expect(toControlValue(italic, true)).toBe("on");
    expect(toControlValue(italic, false)).toBe("off");
    expect(fromControlValue(italic, "on")).toBe(true);
    expect(fromControlValue(italic, "off")).toBe(false);
    const over = control("selected", "over");
    expect(toControlValue(over, true)).toBe("over");
    expect(toControlValue(over, false)).toBe("under");
    expect(fromControlValue(over, "over")).toBe(true);
    expect(fromControlValue(over, "under")).toBe(false);
  });

  it("passes null and unchanged through, both ways", () => {
    for (const c of [control("heading", "italic"), control("today", "text", "italic"), control("heading", "weight")]) {
      expect(toControlValue(c, null)).toBeNull();
      expect(fromControlValue(c, null)).toBeNull();
    }
    const highlightItalic = control("today", "text", "italic");
    expect(toControlValue(highlightItalic, "unchanged")).toBe("unchanged");
    expect(fromControlValue(highlightItalic, "unchanged")).toBe("unchanged");
    expect(fromControlValue(highlightItalic, toControlValue(highlightItalic, true))).toBe(true);
  });

  it("passes other controls through", () => {
    expect(toControlValue(control("heading", "weight"), "bold")).toBe("bold");
    expect(fromControlValue(control("cell", "padding"), 4)).toBe(4);
  });
});

describe("withValue validation", () => {
  it("rejects a value that does not fit the leaf", () => {
    expect(() => withValue(fresh(), "wide", "selected", ["over"], "over")).toThrow();
    expect(() => withValue(fresh(), "narrow", "heading", ["italic"], "on")).toThrow();
    expect(() => withValue(fresh(), "wide", "cell", ["padding"], "x")).toThrow();
  });
});
