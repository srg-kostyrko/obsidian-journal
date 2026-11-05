import { describe, expect, it } from "vitest";

import { appearanceCatalog, publicName, savedName } from "./appearance-catalog";

const names = appearanceCatalog.map((entry) => entry.name);
const find = (name: string) => {
  const entry = appearanceCatalog.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`no catalog entry ${name}`);
  return entry;
};

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

  it("strength probes read opacity and ring-width probes read box-shadow", () => {
    expect(new Set(propertyOf("-strength"))).toEqual(new Set(["opacity"]));
    expect(new Set(propertyOf("-ring-width"))).toEqual(new Set(["box-shadow"]));
  });
});
