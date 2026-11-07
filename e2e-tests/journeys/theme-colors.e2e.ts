import { browser, expect } from "@wdio/globals";

import { THEME_COLORS, themeColorCss } from "../../src/ui/theme-color-list.js";

const UNSET = "rgba(0, 0, 0, 0)";

// Obsidian drops a variable from app.css without notice (--text-highlight-bg left at 1.14), and a
// color stored by name then paints nothing. Every picker color must resolve in both base themes of
// the Obsidian under test; background-color does not inherit, so an unresolved var() reads as UNSET.
async function resolved(css: readonly string[]): Promise<Record<string, Record<string, string>>> {
  return browser.execute((values: readonly string[]) => {
    const body = document.body;
    const original = body.className;
    const probe = body.createDiv();
    const result: Record<string, Record<string, string>> = {};
    try {
      for (const theme of ["theme-light", "theme-dark"]) {
        body.classList.remove("theme-light", "theme-dark");
        body.classList.add(theme);
        result[theme] = Object.fromEntries(
          values.map((value) => {
            probe.style.backgroundColor = value;
            return [value, getComputedStyle(probe).backgroundColor];
          }),
        );
      }
    } finally {
      probe.remove();
      body.className = original;
    }
    return result;
  }, css);
}

describe("theme colors", () => {
  it("reads an undefined variable as unset, so the check below can fail", async () => {
    const result = await resolved(["var(--journal-no-such-color)"]);
    expect(result["theme-light"]?.["var(--journal-no-such-color)"]).toBe(UNSET);
  });

  it("resolves every color the picker offers, in light and dark", async () => {
    const css = THEME_COLORS.map(({ name }) => themeColorCss(name));
    const result = await resolved(css);
    const unresolved = Object.entries(result).flatMap(([theme, colors]) =>
      Object.entries(colors)
        .filter(([, color]) => color === UNSET)
        .map(([value]) => `${theme}: ${value}`),
    );
    expect(unresolved).toEqual([]);
  });
});
