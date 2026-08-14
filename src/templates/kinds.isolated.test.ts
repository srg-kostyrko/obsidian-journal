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
};

const locales = Object.keys(localeImporters) as (keyof typeof localeImporters)[];

describe("renderNumber / patternForKind ordinal round-trip", () => {
  afterEach(() => {
    moment.locale("en");
    vi.resetModules();
  });

  it.each(locales)("inverts an ordinal rendered under %s", async (locale) => {
    vi.resetModules();
    await localeImporters[locale]();
    const { moment: freshMoment } = await import("obsidian");
    freshMoment.locale(locale);

    const { renderNumber, patternForKind } = await import("./kinds");
    await import("./format-regex");

    const rendered = renderNumber({ kind: "number", value: 7 }, [], "o");
    const pattern = new RegExp("^" + patternForKind({ kind: "number", value: 0 }, "o") + "$");

    expect(pattern.test(rendered)).toBe(true);
  });
});
