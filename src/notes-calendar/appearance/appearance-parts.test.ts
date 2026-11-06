import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { calendarDisplaySlice } from "@/calendar";
import { themeColorGroupsFor } from "@/ui/theme-colors";

import { fromControlValue } from "./appearance-editing";
import {
  CHIP_ORDER,
  familiesOf,
  isFormat,
  isStructure,
  PARTS,
  roleFor,
  visibleControls,
  type FormatControl,
  type StructureControl,
  type ValueControl,
  type ValuePartKey,
} from "./appearance-parts";
import { writtenEntryNames } from "./appearance-variables";

const names = (part: ValuePartKey, style?: Parameters<typeof visibleControls>[1]) =>
  visibleControls(part, style).map((control) => {
    if (isStructure(control)) return control.setting;
    return isFormat(control) ? control.label : control.path.join(".");
  });

const formatControls = (): readonly FormatControl[] =>
  Object.values(PARTS).flatMap(({ controls }) => controls.filter((control) => isFormat(control)));

const structureControls = (): readonly StructureControl[] =>
  Object.values(PARTS).flatMap(({ controls }) => controls.filter((control) => isStructure(control)));

describe("PARTS", () => {
  it("every control names a catalog entry the writer produces, and every written entry is reached", () => {
    const written = writtenEntryNames();
    const reached = new Set<string>();
    for (const { controls } of Object.values(PARTS)) {
      for (const control of controls) {
        if (isStructure(control) || isFormat(control) || control.entry === undefined) continue;
        expect(written.has(control.entry)).toBe(true);
        reached.add(control.entry);
      }
    }
    expect([...reached].toSorted()).toEqual([...written].toSorted());
  });

  it("gives the style select no variable name", () => {
    const style = PARTS.today.controls.find(
      (control): control is ValueControl => !isStructure(control) && !isFormat(control) && control.path[0] === "style",
    );
    expect(style ? style.entry : "missing").toBeUndefined();
  });

  it("gives every control a family", () => {
    for (const { controls } of Object.values(PARTS)) {
      for (const control of controls)
        expect(["visibility", "label", "text", "highlight", "box"]).toContain(control.family);
    }
  });

  it("points every visibility control at a display setting whose schema accepts each option", () => {
    const controls = structureControls();
    expect(controls.map((control) => control.setting).toSorted()).toEqual(
      ["monthRows", "outsideDays", "showHeading", "showWeekdays", "weekPlacement"].toSorted(),
    );
    for (const control of controls) {
      expect(Object.keys(calendarDisplaySlice.defaults)).toContain(control.setting);
      const schema = calendarDisplaySlice.schema.entries[control.setting];
      for (const option of control.options) {
        expect(v.safeParse(schema, fromControlValue(control, option)).success).toBe(true);
      }
    }
  });

  it("gives no visibility control a variable name", () => {
    for (const control of structureControls()) expect(Object.hasOwn(control, "entry")).toBe(false);
  });

  it("puts visibility first in a part's controls", () => {
    expect(PARTS.weekNumber.controls[0]?.family).toBe("visibility");
    expect(PARTS.grid.controls.map((control) => control.family)).toEqual(["visibility"]);
  });

  it("gives no format control a variable name", () => {
    for (const control of formatControls()) expect(Object.hasOwn(control, "entry")).toBe(false);
  });

  it("gives each period kind and the weekday exactly one format control", () => {
    expect(
      formatControls()
        .map((control) => control.label)
        .toSorted(),
    ).toEqual(["day", "week", "month", "quarter", "year", "weekday"].toSorted());
  });

  it("places each format on the part that renders it, after visibility", () => {
    const labels = (part: keyof typeof PARTS) =>
      PARTS[part].controls.filter((control) => isFormat(control)).map((control) => control.label);
    expect(labels("heading")).toEqual(["month", "quarter", "year"]);
    expect(labels("weekday")).toEqual(["weekday"]);
    expect(labels("weekNumber")).toEqual(["week"]);
    expect(labels("date")).toEqual(["day"]);
    expect(PARTS.weekday.controls.map((control) => control.family).slice(0, 2)).toEqual(["visibility", "label"]);
  });

  it("suggests the ruled patterns, with no ISO week token", () => {
    const suggestions = Object.fromEntries(formatControls().map((control) => [control.label, control.suggestions]));
    expect(suggestions).toEqual({
      day: ["D", "DD", "Do"],
      week: ["[W]w", "w", "[W]ww", "wo"],
      month: ["MMMM", "MMM", "MM"],
      quarter: ["[Q]Q", "Qo", "Q"],
      year: ["YYYY", "YY"],
      weekday: ["ddd", "dd", "dddd", { type: "letter" }],
    });
  });

  it("orders every part once, most specific first", () => {
    expect(CHIP_ORDER.toSorted()).toEqual(Object.keys(PARTS).toSorted());
    expect(CHIP_ORDER[0]).toBe("active");
    expect(CHIP_ORDER.at(-1)).toBe("grid");
  });
});

describe("familiesOf", () => {
  it("groups a text part's controls visibility first", () => {
    expect(familiesOf("weekday", undefined).map((group) => group.family)).toEqual(["visibility", "label", "text"]);
  });

  it("gives the heading three label controls, month then quarter then year", () => {
    const label = familiesOf("heading", undefined).find((group) => group.family === "label");
    expect(label?.controls.map((control) => (isFormat(control) ? control.label : "other"))).toEqual([
      "month",
      "quarter",
      "year",
    ]);
  });

  it("gives the month grid only visibility", () => {
    expect(familiesOf("grid", undefined).map((group) => group.family)).toEqual(["visibility"]);
  });

  it("drops a family the style hides entirely", () => {
    expect(familiesOf("cell", undefined).map((group) => group.family)).toEqual(["box"]);
    expect(familiesOf("outside", "none").map((group) => group.family)).toEqual(["visibility", "highlight"]);
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
  const color = PARTS.selected.controls.find(
    (control): control is ValueControl =>
      !isStructure(control) && !isFormat(control) && control.path.join(".") === "color",
  );
  const offered = (style: Parameters<typeof roleFor>[1]) =>
    color === undefined ? [] : themeColorGroupsFor(roleFor(color, style)).flatMap((group) => group.names);

  it("offers a ring color the accent and status colors a border reads well in", () => {
    expect(offered("ring")).toContain("text-accent");
  });

  it("keeps a background fill on surface colors", () => {
    expect(offered("background")).not.toContain("text-accent");
  });

  it("leaves a control without a style-dependent role on its own role", () => {
    const text = PARTS.heading.controls.find(
      (control): control is ValueControl => !isStructure(control) && !isFormat(control) && control.kind === "color",
    );
    expect(text && roleFor(text, undefined)).toBe("text");
  });
});
