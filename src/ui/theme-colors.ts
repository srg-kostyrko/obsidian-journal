import { m } from "@/i18n";

import { THEME_COLORS, type ThemeColorName, type ThemeColorTag } from "./theme-color-list";

export type { ThemeColorTag } from "./theme-color-list";
export { themeColorCss } from "./theme-color-list";

export type ThemeColorFieldRole = "text" | "background" | "border" | "fill";

export interface ThemeColorGroup {
  readonly tag: ThemeColorTag;
  readonly names: readonly string[];
}

const LABELS: Readonly<Record<ThemeColorName, () => string>> = {
  "background-primary": () => m.ui_theme_color_background_primary(),
  "background-primary-alt": () => m.ui_theme_color_background_primary_alt(),
  "background-secondary": () => m.ui_theme_color_background_secondary(),
  "background-secondary-alt": () => m.ui_theme_color_background_secondary_alt(),
  "background-modifier-hover": () => m.ui_theme_color_background_modifier_hover(),
  "background-modifier-active-hover": () => m.ui_theme_color_background_modifier_active_hover(),
  "background-modifier-border": () => m.ui_theme_color_background_modifier_border(),
  "background-modifier-border-hover": () => m.ui_theme_color_background_modifier_border_hover(),
  "background-modifier-border-focus": () => m.ui_theme_color_background_modifier_border_focus(),
  "background-modifier-error": () => m.ui_theme_color_background_modifier_error(),
  "background-modifier-error-hover": () => m.ui_theme_color_background_modifier_error_hover(),
  "background-modifier-success": () => m.ui_theme_color_background_modifier_success(),
  "background-modifier-message": () => m.ui_theme_color_background_modifier_message(),
  "interactive-normal": () => m.ui_theme_color_interactive_normal(),
  "interactive-hover": () => m.ui_theme_color_interactive_hover(),
  "interactive-accent": () => m.ui_theme_color_interactive_accent(),
  "interactive-accent-hover": () => m.ui_theme_color_interactive_accent_hover(),
  "text-normal": () => m.ui_theme_color_text_normal(),
  "text-muted": () => m.ui_theme_color_text_muted(),
  "text-faint": () => m.ui_theme_color_text_faint(),
  "text-on-accent": () => m.ui_theme_color_text_on_accent(),
  "text-on-accent-inverted": () => m.ui_theme_color_text_on_accent_inverted(),
  "text-success": () => m.ui_theme_color_text_success(),
  "text-warning": () => m.ui_theme_color_text_warning(),
  "text-error": () => m.ui_theme_color_text_error(),
  "text-accent": () => m.ui_theme_color_text_accent(),
  "text-accent-hover": () => m.ui_theme_color_text_accent_hover(),
  "text-selection": () => m.ui_theme_color_text_selection(),
  "text-highlight-bg": () => m.ui_theme_color_text_highlight_bg(),
  "caret-color": () => m.ui_theme_color_caret_color(),
  "color-red": () => m.ui_theme_color_red(),
  "color-orange": () => m.ui_theme_color_orange(),
  "color-yellow": () => m.ui_theme_color_yellow(),
  "color-green": () => m.ui_theme_color_green(),
  "color-cyan": () => m.ui_theme_color_cyan(),
  "color-blue": () => m.ui_theme_color_blue(),
  "color-purple": () => m.ui_theme_color_purple(),
  "color-pink": () => m.ui_theme_color_pink(),
};

// Tags a field of each role accepts, in the order they are shown. A border reads well in an
// accent or status color, and those live among the text-tagged variables (--text-accent,
// --text-error, --text-success); a decorative mark has no inherent ink-or-surface nature —
// so those two roles span two tags. The palette hues are solid colors with no role of their
// own, so every field offers them.
const ROLE_TAGS: Record<ThemeColorFieldRole, readonly ThemeColorTag[]> = {
  text: ["text", "palette"],
  background: ["background", "palette"],
  border: ["border", "text", "palette"],
  fill: ["text", "background", "palette"],
};

export function themeColorGroupsFor(role: ThemeColorFieldRole): readonly ThemeColorGroup[] {
  return ROLE_TAGS[role].map((tag) => ({
    tag,
    names: THEME_COLORS.filter((color) => color.tag === tag).map((color) => color.name),
  }));
}

const isKnown = (name: string): name is ThemeColorName => Object.hasOwn(LABELS, name);

// A previously stored variable that is not a known theme color round-trips as its raw name.
export function themeColorLabel(name: string): string {
  return isKnown(name) ? LABELS[name]() : name;
}
