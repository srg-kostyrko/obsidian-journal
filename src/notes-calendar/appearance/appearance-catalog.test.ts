import { describe, expect, it } from "vitest";

import { appearanceCatalog, publicName, savedName } from "./appearance-catalog";
import { writtenValue } from "./appearance-variables";
import { appearanceSlice } from "./slice";

const names = appearanceCatalog.map((entry) => entry.name);
const find = (name: string) => {
  const entry = appearanceCatalog.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`no catalog entry ${name}`);
  return entry;
};

const weekNumberEntry = (value: string) => find(`journal-cell-current-week-week-number-text-${value}`);

const propertyOf = (suffix: string) =>
  appearanceCatalog.filter((entry) => entry.name.endsWith(suffix)).map((entry) => entry.probe.property);

describe("appearanceCatalog", () => {
  it("names follow part-value", () => {
    expect(names).toEqual(
      expect.arrayContaining([
        "journal-cell-today-color",
        "journal-cell-today-text-color",
        "journal-cell-selected-ring-width",
        "journal-cell-active-strength",
        "journal-cell-weekday-size",
        "journal-cell-cell-min-height",
        "journal-cell-today-layer",
        "journal-cell-selected-layer",
        "journal-cell-active-layer",
        "journal-cell-weekend-color",
        "journal-cell-current-week-layer",
      ]),
    );
  });

  it("names are unique and all start with journal-cell-", () => {
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => name.startsWith("journal-cell-"))).toBe(true);
  });

  it("savedName inserts saved", () => {
    const entry = find("journal-cell-today-color");
    expect(publicName(entry)).toBe("--journal-cell-today-color");
    expect(savedName(entry)).toBe("--journal-saved-cell-today-color");
    expect(publicName(entry, true)).toBe("--journal-cell-today-color-narrow");
    expect(savedName(entry, true)).toBe("--journal-saved-cell-today-color-narrow");
  });

  it("every probe has a sample that differs from its stock", () => {
    for (const entry of appearanceCatalog) {
      expect({ name: entry.name, same: entry.probe.sample === entry.stock }).toEqual({ name: entry.name, same: false });
      expect({ name: entry.name, selector: entry.probe.selector }).not.toEqual({ name: entry.name, selector: "" });
    }
  });

  it("every probe states what the gate expects, and its companions are catalog names", () => {
    const publicNames = new Set(appearanceCatalog.map((entry) => publicName(entry)));
    for (const entry of appearanceCatalog) {
      expect({ name: entry.name, empty: entry.probe.expect === "" }).toEqual({ name: entry.name, empty: false });
      const companions = Object.keys(entry.probe.with ?? {});
      for (const key of companions) {
        expect({ name: entry.name, key, known: publicNames.has(key as `--${string}`) }).toEqual({
          name: entry.name,
          key,
          known: true,
        });
      }
    }
  });

  // A band draws its fill and ring outside every cell, so its probes read the band, not a cell layer.
  it.each(["weekend", "current-week"])("probes the %s band's own layers and its text on the cell", (state) => {
    const probe = (value: string) =>
      appearanceCatalog.find((entry) => entry.name === `journal-cell-${state}-${value}`)?.probe.selector;
    expect({
      color: probe("color"),
      ring: probe("ring-width"),
      strength: probe("strength"),
      layer: probe("layer"),
      text: probe("text-color"),
    }).toEqual({
      color: `.notes-calendar-band__layer[data-layer="${state}-fill"]`,
      ring: `.notes-calendar-band__layer[data-layer="${state}-ring"]`,
      strength: `.notes-calendar-band__layer[data-layer="${state}-fill"]`,
      layer: `.notes-calendar-band__layer[data-layer="${state}-fill"]`,
      text: `.notes-calendar-cell[data-${state}] > .notes-calendar-cell__text`,
    });
  });

  it("probes the current week's week-number text on the week number alone, with an accent bold stock", () => {
    const weekNumber = ".notes-month-view__week-number[data-current-week]";
    expect(
      ["color", "weight", "italic"].map((value) => ({
        stock: weekNumberEntry(value).stock,
        selector: weekNumberEntry(value).probe.selector,
        property: weekNumberEntry(value).probe.property,
      })),
    ).toEqual([
      { stock: "var(--text-accent)", selector: `${weekNumber} > .notes-calendar-cell__text`, property: "color" },
      { stock: "var(--font-bold)", selector: `${weekNumber} .cell-decoration__content`, property: "font-weight" },
      { stock: "", selector: `${weekNumber} .cell-decoration__content`, property: "font-style" },
    ]);
  });

  it("strength probes read opacity and ring-width probes read box-shadow", () => {
    expect(new Set(propertyOf("-strength"))).toEqual(new Set(["opacity"]));
    expect(new Set(propertyOf("-ring-width"))).toEqual(new Set(["box-shadow"]));
  });
});

describe("stock narrow values", () => {
  const withStockNarrow = appearanceCatalog.filter((entry) => entry.stockNarrow !== undefined);

  it("every stock narrow string is what the writer makes of the stock narrow values", () => {
    const defaults = structuredClone(appearanceSlice.defaults);
    expect(withStockNarrow.length).toBeGreaterThan(0);
    expect(
      withStockNarrow.map((entry) => ({ name: entry.name, css: writtenValue(entry.name)?.narrowCss(defaults) })),
    ).toEqual(withStockNarrow.map((entry) => ({ name: entry.name, css: entry.stockNarrow })));
  });

  it("states the growing row height and the larger wide dates as their stock", () => {
    expect([
      find("journal-cell-cell-min-height"),
      find("journal-cell-date-size"),
      find("journal-cell-cell-gap"),
    ]).toEqual([
      expect.objectContaining({ stock: "clamp(26px, 7cqi, 64px)", stockNarrow: "26px" }),
      expect.objectContaining({ stock: "1.1em", stockNarrow: "1em" }),
      expect.objectContaining({ stock: "var(--size-2-1)", stockNarrow: "1px" }),
    ]);
  });
});
