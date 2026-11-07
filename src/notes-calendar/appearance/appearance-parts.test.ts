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
import { appearanceSlice } from "./slice";

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
        expect(["visibility", "label", "text", "divider", "highlight", "box"]).toContain(control.family);
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

const valueControls = (part: "today" | "currentWeek") =>
  PARTS[part].controls.filter((control): control is ValueControl => !isStructure(control) && !isFormat(control));

describe("the band parts", () => {
  it.each(["weekend", "currentWeek"] as const)("%s at none is the highlight style alone", (part) => {
    expect(familiesOf(part, "none").map((group) => group.family)).toEqual(["highlight"]);
    expect(names(part, "none")).toEqual(["style"]);
  });

  it("gives the current week a week-number text group after the days' text and before the layer", () => {
    const added = valueControls("currentWeek").filter((control) => control.path[0] === "weekNumberText");
    expect(added).toEqual([
      {
        family: "highlight",
        path: ["weekNumberText", "color"],
        kind: "color",
        entry: "journal-cell-current-week-week-number-text-color",
        role: "text",
        unchanged: true,
        shownFor: ["text", "ring", "background"],
      },
      {
        family: "highlight",
        path: ["weekNumberText", "weight"],
        kind: "select",
        entry: "journal-cell-current-week-week-number-text-weight",
        options: ["normal", "semibold", "bold"],
        unchanged: true,
        shownFor: ["text", "ring", "background"],
      },
      {
        family: "highlight",
        path: ["weekNumberText", "italic"],
        kind: "select",
        entry: "journal-cell-current-week-week-number-text-italic",
        options: ["on", "off"],
        unchanged: true,
        shownFor: ["text", "ring", "background"],
      },
    ]);
    expect(names("currentWeek", "text")).toEqual([
      "style",
      "text.color",
      "text.weight",
      "text.italic",
      "weekNumberText.color",
      "weekNumberText.weight",
      "weekNumberText.italic",
    ]);
    expect(names("currentWeek", "ring").slice(-2)).toEqual(["weekNumberText.italic", "over"]);
    expect(valueControls("today").some((control) => control.path[0] === "weekNumberText")).toBe(false);
  });

  it("feeds the weekend's variables from its own catalog entries", () => {
    const entries = PARTS.weekend.controls.flatMap((control) => ("entry" in control ? [control.entry] : []));
    expect(entries).toContain("journal-cell-weekend-color");
    expect(PARTS.currentWeek.controls.flatMap((control) => ("entry" in control ? [control.entry] : []))).toContain(
      "journal-cell-current-week-color",
    );
  });

  it("orders the chips Current week before Weekends, after Today", () => {
    expect(CHIP_ORDER).toEqual([
      "active",
      "selected",
      "today",
      "currentWeek",
      "weekend",
      "outside",
      "date",
      "weekNumber",
      "weekday",
      "heading",
      "cell",
      "grid",
    ]);
  });
});

describe("the week number's divider", () => {
  const shown = { ...appearanceSlice.defaults.wide.weekNumber, divider: true };
  const hidden = { ...shown, divider: false };
  const groups = (values: typeof shown) =>
    familiesOf("weekNumber", undefined, values).map((group) => ({
      family: group.family,
      paths: group.controls.map((control) =>
        isStructure(control) || isFormat(control) ? control.family : control.path.join("."),
      ),
    }));

  it("week numbers show the divider family after text, its color and width only while shown", () => {
    expect(groups(shown).map((group) => group.family)).toEqual(["visibility", "label", "text", "divider"]);
    expect(groups(shown).at(-1)?.paths).toEqual(["divider", "dividerColor", "dividerWidth"]);
    expect(groups(hidden).at(-1)?.paths).toEqual(["divider"]);
  });

  it("offers the divider shown or hidden, a border color and a 1–4px width", () => {
    const controls = PARTS.weekNumber.controls.filter(
      (control): control is ValueControl => !isStructure(control) && !isFormat(control) && control.family === "divider",
    );
    expect(
      controls.map(({ path, kind, entry, role, options, range }) => ({ path, kind, entry, role, options, range })),
    ).toEqual([
      {
        path: ["divider"],
        kind: "select",
        entry: undefined,
        role: undefined,
        options: ["shown", "hidden"],
        range: undefined,
      },
      {
        path: ["dividerColor"],
        kind: "color",
        entry: "journal-cell-week-number-divider-color",
        role: "border",
        options: undefined,
        range: undefined,
      },
      {
        path: ["dividerWidth"],
        kind: "slider",
        entry: "journal-cell-week-number-divider-width",
        role: undefined,
        options: undefined,
        range: { min: 1, max: 4, step: 1, unit: "px" },
      },
    ]);
  });

  it("stores the divider select's options as the boolean", () => {
    const select = PARTS.weekNumber.controls.find(
      (control): control is ValueControl =>
        !isStructure(control) && !isFormat(control) && control.path.join(".") === "divider",
    );
    expect(select && [fromControlValue(select, "shown"), fromControlValue(select, "hidden")]).toEqual([true, false]);
  });

  it("leaves every control of the part without its values", () => {
    expect(visibleControls("weekNumber", undefined)).toBe(PARTS.weekNumber.controls);
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
