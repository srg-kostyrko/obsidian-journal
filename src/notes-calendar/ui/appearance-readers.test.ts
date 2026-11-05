import { describe, expect, it } from "vitest";

import { appearanceCatalog, type CatalogEntry } from "../appearance/appearance-catalog";
import { calendarStyleRules, NARROW_QUERY, narrowReader, privateName, wideReader, type ScopedRule } from "../testing";

const components = calendarStyleRules();
type Component = keyof typeof components;

const GRID_PARTS = ["heading", "weekday", "week-number", "date", "cell-gap"];

// Each grid renders its own heading, weekday header, week numbers, dates and gaps, so each has to read
// them — the editor's preview grid included; the highlights and the cell box live in the cell alone.
function renderers(entry: CatalogEntry): readonly Component[] {
  const part = entry.name.replace(/^journal-cell-/, "");
  return GRID_PARTS.some((prefix) => part.startsWith(`${prefix}-`) || part === prefix)
    ? ["monthView", "weekView", "preview"]
    : ["cell"];
}

const cases = appearanceCatalog.flatMap((entry) =>
  renderers(entry).map((component) => [entry.name, component, entry] as const),
);

describe("calendar appearance readers", () => {
  it("assigns every catalog entry to the components that render it", () => {
    expect(appearanceCatalog.filter((entry) => renderers(entry).length === 3).length).toBe(21);
  });

  it.each(cases)(
    "%s is resolved by %s once per selector and re-resolved under the narrow query",
    (_name, component, entry) => {
      const rules: readonly ScopedRule[] = components[component];
      const name = privateName(entry);
      const wide = rules.filter((rule) => rule.container === null && rule.declarations.has(name));
      expect(wide.length).toBeGreaterThan(0);
      for (const rule of wide) {
        expect({ selector: rule.selector, value: rule.declarations.get(name) }).toEqual({
          selector: rule.selector,
          value: wideReader(entry),
        });
        const narrow = rules.find(
          (candidate) => candidate.container === NARROW_QUERY && candidate.selector === rule.selector,
        );
        expect({ selector: rule.selector, narrow: narrow?.declarations.get(name) }).toEqual({
          selector: rule.selector,
          narrow: narrowReader(entry),
        });
      }
    },
  );

  it.each(cases)("%s is read by %s outside the private values", (_name, component, entry) => {
    const read = `var(${privateName(entry)})`;
    const readers = components[component].flatMap((rule) =>
      [...rule.declarations].filter(([property, value]) => !property.startsWith("--_v-") && value.includes(read)),
    );
    expect(readers.length).toBeGreaterThan(0);
  });

  it.each(Object.entries(components))("%s reads no public variable outside its private values", (_name, rules) => {
    const leaks = rules.flatMap((rule) =>
      [...rule.declarations]
        .filter(([property, value]) => !property.startsWith("--_v-") && /--journal-(saved-)?cell-/.test(value))
        .map(([property]) => `${rule.selector} { ${property} }`),
    );
    expect(leaks).toEqual([]);
  });
});

const STATES = ["outside", "today", "selected", "active"] as const;
const TEXT_VALUES = [
  ["text-color", "text"],
  ["text-weight", "weight"],
  ["text-italic", "italic"],
] as const;
const passThroughCases = STATES.flatMap((state) =>
  TEXT_VALUES.map(([value, slot]) => [state, value, `--_${slot}-${state}`] as const),
);

describe("calendar appearance Unchanged pass-through", () => {
  // The query is answered by the span's parent, the cell, which is where `--_v-*` lives.
  it.each(passThroughCases)("%s %s clears %s on the text span when it reads unchanged", (state, value, slot) => {
    const container = `style(--_v-${state}-${value}: unchanged)`;
    const rules = components.cell.filter((rule) => rule.container === container);
    expect(rules.map((rule) => ({ selector: rule.selector, value: rule.declarations.get(slot) }))).toEqual([
      { selector: `.notes-calendar-cell[data-${state}] > .notes-calendar-cell__text`, value: "initial" },
    ]);
  });
});
