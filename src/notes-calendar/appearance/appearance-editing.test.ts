import { describe, expect, it } from "vitest";

import { calendarDisplaySlice } from "@/calendar";

import {
  formatAt,
  fromControlValue,
  isModified,
  sourceAt,
  structureAt,
  toControlValue,
  valueAt,
  withNarrowCleared,
  withReset,
  withFormat,
  withStructure,
  withValue,
} from "./appearance-editing";
import {
  isFormat,
  isStructure,
  PARTS,
  type FormatControl,
  type PartKey,
  type StructureControl,
  type ValueControl,
} from "./appearance-parts";
import { appearanceSlice } from "./slice";

const fresh = () => structuredClone(appearanceSlice.defaults);
const stockDisplay = () => structuredClone(calendarDisplaySlice.defaults);
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
    const wideReset = withReset(state, stockDisplay(), "wide", "cell").appearance;
    expect(wideReset.wide.cell).toEqual(appearanceSlice.defaults.wide.cell);
    expect(wideReset.narrow.cell.gap).toBe("2px");
    const narrowReset = withReset(state, stockDisplay(), "narrow", "cell").appearance;
    expect(narrowReset.narrow.cell.gap).toBeNull();
    expect(narrowReset.wide.cell.padding).toBe(5);
  });

  it("restores a theme-expression stock", () => {
    const written = withValue(fresh(), "wide", "cell", ["radius"], "4px");
    expect(valueAt(written, "wide", "cell", ["radius"])).toBe("4px");
    expect(valueAt(withReset(written, stockDisplay(), "wide", "cell").appearance, "wide", "cell", ["radius"])).toBe(
      "var(--radius-s)",
    );
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

describe("the band parts", () => {
  it("withReset restores a band part's stock", () => {
    let state = withValue(fresh(), "wide", "currentWeek", ["style"], "background");
    state = withValue(state, "wide", "currentWeek", ["strength"], 40);
    const reset = withReset(state, stockDisplay(), "wide", "currentWeek").appearance;
    expect(reset.wide.currentWeek).toEqual(appearanceSlice.defaults.wide.currentWeek);
  });

  it("isModified is true after setting the weekend's style", () => {
    const base = fresh();
    expect(isModified(base, stockDisplay(), "wide", "weekend")).toBe(false);
    expect(isModified(withValue(base, "wide", "weekend", ["style"], "ring"), stockDisplay(), "wide", "weekend")).toBe(
      true,
    );
  });
});

describe("isModified", () => {
  it("is false for defaults at both widths and true after any withValue", () => {
    const base = fresh();
    const display = stockDisplay();
    expect(isModified(base, display, "wide", "cell")).toBe(false);
    expect(isModified(base, display, "narrow", "cell")).toBe(false);
    expect(isModified(withValue(base, "wide", "cell", ["padding"], 2), display, "wide", "cell")).toBe(true);
    expect(
      isModified(withValue(base, "narrow", "today", TEXT_COLOR, custom("#222222")), display, "narrow", "today"),
    ).toBe(true);
  });

  it("counts a part's structure at wide only", () => {
    const display = { ...stockDisplay(), monthRows: "six" as const };
    expect(isModified(fresh(), stockDisplay(), "wide", "grid")).toBe(false);
    expect(isModified(fresh(), display, "wide", "grid")).toBe(true);
    expect(isModified(fresh(), display, "narrow", "grid")).toBe(false);
    expect(isModified(fresh(), { ...stockDisplay(), showWeekdays: false }, "wide", "weekday")).toBe(true);
  });

  it("ignores a structure setting no control of the part writes", () => {
    expect(isModified(fresh(), { ...stockDisplay(), monthRows: "six" }, "wide", "weekday")).toBe(false);
    expect(isModified(fresh(), { ...stockDisplay(), timelineNavigation: true }, "wide", "grid")).toBe(false);
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

const control = (part: PartKey, ...path: string[]): ValueControl => {
  const found = PARTS[part].controls.find(
    (candidate): candidate is ValueControl =>
      !isStructure(candidate) && !isFormat(candidate) && candidate.path.join(".") === path.join("."),
  );
  if (!found) throw new Error(`no control ${path.join(".")}`);
  return found;
};

const structure = (part: PartKey): StructureControl => {
  const found = PARTS[part].controls.find((candidate) => isStructure(candidate));
  if (!found) throw new Error(`no visibility control on ${part}`);
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

describe("structure", () => {
  it("speaks shown and hidden for a boolean setting", () => {
    const heading = structure("heading");
    expect(structureAt(stockDisplay(), heading)).toBe("shown");
    const hidden = withStructure(stockDisplay(), heading, "hidden");
    expect(hidden.showHeading).toBe(false);
    expect(structureAt(hidden, heading)).toBe("hidden");
    expect(withStructure(hidden, heading, "shown").showHeading).toBe(true);
  });

  it("passes a picklist setting through", () => {
    const outside = structure("outside");
    expect(structureAt(stockDisplay(), outside)).toBe("automatic");
    expect(withStructure(stockDisplay(), outside, "inert").outsideDays).toBe("inert");
  });

  it("writes only its own setting", () => {
    const base = stockDisplay();
    const next = withStructure(base, structure("grid"), "six");
    expect(next).toEqual({ ...base, monthRows: "six" });
    expect(base.monthRows).toBe("fit");
  });

  it("rejects a value the setting does not accept", () => {
    expect(() => withStructure(stockDisplay(), structure("grid"), "seven")).toThrow();
    expect(() => withStructure(stockDisplay(), structure("heading"), true)).toThrow();
  });
});

const changed = () => {
  const appearance = withValue(fresh(), "wide", "outside", ["style"], "ring");
  return {
    appearance: withValue(appearance, "narrow", "outside", ["ringWidth"], 3),
    display: { ...stockDisplay(), outsideDays: "hidden" as const, monthRows: "six" as const },
  };
};

describe("withReset with structure", () => {
  it("at wide restores the part's structure and highlight, and nothing else", () => {
    const { appearance, display } = changed();
    const reset = withReset(appearance, display, "wide", "outside");
    expect(reset.display.outsideDays).toBe("automatic");
    expect(reset.display.monthRows).toBe("six");
    expect(reset.appearance.wide.outside).toEqual(appearanceSlice.defaults.wide.outside);
    expect(reset.appearance.narrow.outside.ringWidth).toBe(3);
  });

  it("at narrow leaves structure alone", () => {
    const { appearance, display } = changed();
    const reset = withReset(appearance, display, "narrow", "outside");
    expect(reset.display.outsideDays).toBe("hidden");
    expect(reset.appearance.narrow.outside).toEqual(appearanceSlice.defaults.narrow.outside);
    expect(reset.appearance.wide.outside.style).toBe("ring");
  });

  it("resets the month grid's rows and leaves the appearance untouched", () => {
    const { appearance, display } = changed();
    const reset = withReset(appearance, display, "wide", "grid");
    expect(reset.display.monthRows).toBe("fit");
    expect(reset.appearance).toBe(appearance);
  });
});

const format = (label: FormatControl["label"]): FormatControl => {
  const found = Object.values(PARTS)
    .flatMap(({ controls }) => controls)
    .find((candidate): candidate is FormatControl => isFormat(candidate) && candidate.label === label);
  if (!found) throw new Error(`no format control for ${label}`);
  return found;
};

describe("formatAt", () => {
  it("reads a period's pattern at either width", () => {
    const display = { ...stockDisplay(), labels: { ...stockDisplay().labels, week: "[W]ww" } };
    expect(formatAt(display, format("week"), "wide")).toBe("[W]ww");
    expect(formatAt(display, format("week"), "narrow")).toBe("[W]ww");
    expect(formatAt(stockDisplay(), format("day"), "wide")).toBe("");
  });

  it("reads the weekday per width, one letter as its object and an unset narrow as null", () => {
    const display = { ...stockDisplay(), weekdayLabel: { type: "letter" as const } };
    expect(formatAt(display, format("weekday"), "wide")).toEqual({ type: "letter" });
    expect(formatAt(display, format("weekday"), "narrow")).toBeNull();
    const narrow = { ...display, weekdayLabelNarrow: { type: "pattern" as const, pattern: "dd" } };
    expect(formatAt(narrow, format("weekday"), "narrow")).toBe("dd");
    expect(formatAt(stockDisplay(), format("weekday"), "wide")).toBe("");
  });
});

describe("withFormat", () => {
  it("writes a period's pattern and nothing else", () => {
    const base = stockDisplay();
    const next = withFormat(base, format("day"), "wide", "DD");
    expect(next.labels.day).toBe("DD");
    expect(next).toEqual({ ...base, labels: { ...base.labels, day: "DD" } });
    expect(base.labels.day).toBe("");
  });

  it("writes the same period pattern at narrow, since a period has one format", () => {
    expect(withFormat(stockDisplay(), format("month"), "narrow", "MMM").labels.month).toBe("MMM");
  });

  it("writes one letter at narrow as the tagged shape and leaves the wide label alone", () => {
    const next = withFormat(stockDisplay(), format("weekday"), "narrow", { type: "letter" });
    expect(next.weekdayLabelNarrow).toEqual({ type: "letter" });
    expect(next.weekdayLabel).toEqual(calendarDisplaySlice.defaults.weekdayLabel);
  });

  it("writes the typed word letter as a pattern, never as one letter", () => {
    const next = withFormat(stockDisplay(), format("weekday"), "wide", "letter");
    expect(next.weekdayLabel).toEqual({ type: "pattern", pattern: "letter" });
  });

  it.each([
    ["day", "D", "date"],
    ["week", "[W]w", "weekNumber"],
    ["month", "MMMM", "heading"],
    ["quarter", "[Q]Q", "heading"],
    ["year", "YYYY", "heading"],
  ] as const)("stores the %s default pattern %s as empty, so %s does not read modified", (label, pattern, part) => {
    const set = withFormat(stockDisplay(), format(label), "wide", "DD");
    const next = withFormat(set, format(label), "wide", pattern);
    expect(next.labels[label]).toBe("");
    expect(isModified(fresh(), next, "wide", part)).toBe(false);
  });

  it("stores the weekday default pattern as empty at either width", () => {
    const wide = withFormat(stockDisplay(), format("weekday"), "wide", "ddd");
    expect(wide.weekdayLabel).toEqual({ type: "pattern", pattern: "" });
    expect(isModified(fresh(), wide, "wide", "weekday")).toBe(false);
    const narrow = withFormat(stockDisplay(), format("weekday"), "narrow", "ddd");
    expect(narrow.weekdayLabelNarrow).toEqual({ type: "pattern", pattern: "" });
  });

  it("reads an empty narrow weekday as same as wide, so narrow is not modified", () => {
    const set = withFormat(stockDisplay(), format("weekday"), "narrow", "dd");
    const cleared = withFormat(set, format("weekday"), "narrow", "");
    expect(cleared.weekdayLabelNarrow).toBeNull();
    expect(isModified(fresh(), cleared, "narrow", "weekday")).toBe(false);
    expect(withFormat(stockDisplay(), format("weekday"), "wide", "").weekdayLabel).toEqual({
      type: "pattern",
      pattern: "",
    });
  });

  it("writes a wide weekday pattern and leaves narrow alone", () => {
    const next = withFormat(stockDisplay(), format("weekday"), "wide", "dddd");
    expect(next.weekdayLabel).toEqual({ type: "pattern", pattern: "dddd" });
    expect(next.weekdayLabelNarrow).toBeNull();
  });

  it("clears the narrow weekday back to same as wide with null", () => {
    const set = withFormat(stockDisplay(), format("weekday"), "narrow", { type: "letter" });
    expect(withFormat(set, format("weekday"), "narrow", null).weekdayLabelNarrow).toBeNull();
  });

  it("rejects null anywhere but the narrow weekday", () => {
    expect(() => withFormat(stockDisplay(), format("weekday"), "wide", null)).toThrow();
    expect(() => withFormat(stockDisplay(), format("day"), "narrow", null)).toThrow();
  });
});

const labelled = () => {
  let display = stockDisplay();
  for (const [label, pattern] of [
    ["month", "MMM"],
    ["quarter", "Q"],
    ["year", "YY"],
    ["day", "DD"],
  ] as const) {
    display = withFormat(display, format(label), "wide", pattern);
  }
  return display;
};

describe("label formats in modified and reset", () => {
  it("counts a part's formats at wide", () => {
    expect(isModified(fresh(), labelled(), "wide", "heading")).toBe(true);
    expect(isModified(fresh(), labelled(), "wide", "date")).toBe(true);
    expect(isModified(fresh(), labelled(), "wide", "weekNumber")).toBe(false);
    const weekday = withFormat(stockDisplay(), format("weekday"), "wide", { type: "letter" });
    expect(isModified(fresh(), weekday, "wide", "weekday")).toBe(true);
  });

  it("counts at narrow only the narrow weekday", () => {
    expect(isModified(fresh(), labelled(), "narrow", "heading")).toBe(false);
    expect(isModified(fresh(), withFormat(stockDisplay(), format("weekday"), "wide", "dd"), "narrow", "weekday")).toBe(
      false,
    );
    const narrow = withFormat(stockDisplay(), format("weekday"), "narrow", "dd");
    expect(isModified(fresh(), narrow, "narrow", "weekday")).toBe(true);
    expect(isModified(fresh(), withFormat(narrow, format("weekday"), "narrow", null), "narrow", "weekday")).toBe(false);
  });

  it("at wide restores the heading's three labels and leaves the day label", () => {
    const reset = withReset(fresh(), labelled(), "wide", "heading").display;
    expect(reset.labels).toEqual({ ...calendarDisplaySlice.defaults.labels, day: "DD" });
  });

  it("at wide restores the weekday label and keeps its narrow one", () => {
    let display = withFormat(stockDisplay(), format("weekday"), "wide", "dddd");
    display = withFormat(display, format("weekday"), "narrow", { type: "letter" });
    const reset = withReset(fresh(), display, "wide", "weekday").display;
    expect(reset.weekdayLabel).toEqual(calendarDisplaySlice.defaults.weekdayLabel);
    expect(reset.weekdayLabelNarrow).toEqual({ type: "letter" });
  });

  it("at narrow clears only the narrow weekday", () => {
    let display = withFormat(stockDisplay(), format("weekday"), "wide", "dddd");
    display = withFormat(display, format("weekday"), "narrow", { type: "letter" });
    display = { ...display, showWeekdays: false };
    const reset = withReset(fresh(), display, "narrow", "weekday").display;
    expect(reset).toEqual({ ...display, weekdayLabelNarrow: null });
    expect(withReset(fresh(), labelled(), "narrow", "heading").display).toEqual(labelled());
  });
});
