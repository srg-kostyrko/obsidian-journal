import { describe, expect, it } from "vitest";

import { appearanceCatalog } from "../appearance/appearance-catalog";
import { calendarStyleRules, NARROW_QUERY, narrowReader, privateName, wideReader, type ScopedRule } from "../testing";

const components = calendarStyleRules();
const allRules: readonly ScopedRule[] = Object.values(components).flat();

function wideDeclarations(rules: readonly ScopedRule[], name: string): readonly ScopedRule[] {
  return rules.filter((rule) => rule.container === null && rule.declarations.has(name));
}

describe("calendar appearance readers", () => {
  it.each(appearanceCatalog.map((entry) => [entry.name, entry] as const))(
    "%s is resolved once per selector and re-resolved under the narrow query",
    (_name, entry) => {
      const name = privateName(entry);
      const wide = wideDeclarations(allRules, name);
      expect(wide.length).toBeGreaterThan(0);
      for (const rule of wide) {
        expect({ selector: rule.selector, value: rule.declarations.get(name) }).toEqual({
          selector: rule.selector,
          value: wideReader(entry),
        });
        const narrow = allRules.find(
          (candidate) => candidate.container === NARROW_QUERY && candidate.selector === rule.selector,
        );
        expect({ selector: rule.selector, narrow: narrow?.declarations.get(name) }).toEqual({
          selector: rule.selector,
          narrow: narrowReader(entry),
        });
      }
    },
  );

  it.each(appearanceCatalog.map((entry) => [entry.name, entry] as const))(
    "%s reaches a declaration outside the private values",
    (_name, entry) => {
      const read = `var(${privateName(entry)})`;
      const readers = allRules.flatMap((rule) =>
        [...rule.declarations].filter(([property, value]) => !property.startsWith("--_v-") && value.includes(read)),
      );
      expect(readers.length).toBeGreaterThan(0);
    },
  );

  it.each(Object.entries(components))("%s reads no public variable outside its private values", (_name, rules) => {
    const leaks = rules.flatMap((rule) =>
      [...rule.declarations]
        .filter(([property, value]) => !property.startsWith("--_v-") && /--journal-(saved-)?cell-/.test(value))
        .map(([property]) => `${rule.selector} { ${property} }`),
    );
    expect(leaks).toEqual([]);
  });
});
