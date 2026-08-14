import { moment } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";

// moment ships no type declarations for its locale subpath modules.
const localeImporters = {
  // @ts-expect-error -- see above
  uk: () => import("moment/locale/uk"),
  // @ts-expect-error -- see above
  ru: () => import("moment/locale/ru"),
  // @ts-expect-error -- see above
  ja: () => import("moment/locale/ja"),
  // @ts-expect-error -- see above
  fr: () => import("moment/locale/fr"),
  // @ts-expect-error -- see above
  az: () => import("moment/locale/az"),
  // @ts-expect-error -- see above
  cy: () => import("moment/locale/cy"),
  // @ts-expect-error -- see above
  ka: () => import("moment/locale/ka"),
};

type Locale = keyof typeof localeImporters;

async function loadKindsUnder(locale: Locale) {
  vi.resetModules();
  await localeImporters[locale]();
  const { moment: freshMoment } = await import("obsidian");
  freshMoment.locale(locale);

  const kinds = await import("./kinds");
  // format-regex.ts captures locale data at module-import time, so it must be imported after
  // the locale is set, in the same reset generation as ./kinds.
  await import("./format-regex");
  return kinds;
}

describe("renderNumber / patternForKind ordinal round-trip", () => {
  afterEach(() => {
    moment.locale("en");
    vi.resetModules();
  });

  it.each(["uk", "ru", "ja", "fr"] as const)("inverts a positive ordinal rendered under %s", async (locale) => {
    const { renderNumber, patternForKind } = await loadKindsUnder(locale);

    const rendered = renderNumber({ kind: "number", value: 7 }, [], "o");
    const pattern = new RegExp("^" + patternForKind({ kind: "number", value: 0 }, "o") + "$");

    expect(pattern.test(rendered)).toBe(true);
  });

  it.each(["cy", "ka"] as const)("inverts a zero-value ordinal rendered under %s", async (locale) => {
    const { renderNumber, patternForKind } = await loadKindsUnder(locale);

    const rendered = renderNumber({ kind: "number", value: 0 }, [], "o");
    const pattern = new RegExp("^" + patternForKind({ kind: "number", value: 0 }, "o") + "$");

    expect(pattern.test(rendered)).toBe(true);
  });

  it('renders a negative ordinal under az without a literal "null"', async () => {
    const { renderNumber } = await loadKindsUnder("az");

    const rendered = renderNumber({ kind: "number", value: -3 }, [], "o");

    expect(typeof rendered).toBe("string");
    expect(rendered).not.toContain("null");
  });
});
