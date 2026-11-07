// The tag is what the variable is *for*, hand-assigned rather than derived from the name,
// because the prefixes lie in both directions: --text-selection and --text-highlight-bg are
// fills, and every --background-modifier-border* is a stroke. Obsidian's own
// --background-modifier-{error,success}-rgb are bare RGB triples, unusable as var() colors,
// so they are absent entirely. No imports: the e2e suite reads this list in real Obsidian.
export type ThemeColorTag = "background" | "border" | "text";

export const THEME_COLORS = [
  { name: "background-primary", tag: "background" },
  { name: "background-primary-alt", tag: "background" },
  { name: "background-secondary", tag: "background" },
  { name: "background-secondary-alt", tag: "background" },
  { name: "background-modifier-hover", tag: "background" },
  { name: "background-modifier-active-hover", tag: "background" },
  { name: "background-modifier-border", tag: "border" },
  { name: "background-modifier-border-hover", tag: "border" },
  { name: "background-modifier-border-focus", tag: "border" },
  { name: "background-modifier-error", tag: "background" },
  { name: "background-modifier-error-hover", tag: "background" },
  { name: "background-modifier-success", tag: "background" },
  { name: "background-modifier-message", tag: "background" },
  { name: "interactive-normal", tag: "background" },
  { name: "interactive-hover", tag: "background" },
  { name: "interactive-accent", tag: "background" },
  { name: "interactive-accent-hover", tag: "background" },
  { name: "text-normal", tag: "text" },
  { name: "text-muted", tag: "text" },
  { name: "text-faint", tag: "text" },
  { name: "text-on-accent", tag: "text" },
  { name: "text-on-accent-inverted", tag: "text" },
  { name: "text-success", tag: "text" },
  { name: "text-warning", tag: "text" },
  { name: "text-error", tag: "text" },
  { name: "text-accent", tag: "text" },
  { name: "text-accent-hover", tag: "text" },
  { name: "text-selection", tag: "background" },
  { name: "text-highlight-bg", tag: "background" },
  { name: "caret-color", tag: "text" },
] as const satisfies readonly { name: string; tag: ThemeColorTag }[];

export type ThemeColorName = (typeof THEME_COLORS)[number]["name"];

// Obsidian 1.14 dropped --text-highlight-bg from app.css and reads it only as a theme's override of
// its successor, which 1.13 and earlier lack; the chain is Obsidian's own.
const FALLBACKS: Readonly<Partial<Record<string, string>>> = {
  "text-highlight-bg": "var(--highlight-background-yellow)",
};

/** The CSS a theme color renders as, on every supported Obsidian. */
export function themeColorCss(name: string): string {
  const fallback = FALLBACKS[name];
  return fallback === undefined ? `var(--${name})` : `var(--${name}, ${fallback})`;
}
