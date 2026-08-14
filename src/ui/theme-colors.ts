import { m } from "@/i18n";

export type ThemeColorTag = "background" | "border" | "text";

export type ThemeColorFieldRole = "text" | "background" | "border" | "fill";

export interface ThemeColorGroup {
  readonly tag: ThemeColorTag;
  readonly names: readonly string[];
}

interface ThemeColor {
  readonly name: string;
  readonly tag: ThemeColorTag;
  readonly label: () => string;
}

// The tag is what the variable is *for*, hand-assigned rather than derived from the name,
// because the prefixes lie in both directions: --text-selection and --text-highlight-bg are
// fills, and every --background-modifier-border* is a stroke. Obsidian's own
// --background-modifier-{error,success}-rgb are bare RGB triples, unusable as var() colors,
// so they are absent entirely.
const THEME_COLORS: readonly ThemeColor[] = [
  { name: "background-primary", tag: "background", label: () => m.ui_theme_color_background_primary() },
  { name: "background-primary-alt", tag: "background", label: () => m.ui_theme_color_background_primary_alt() },
  { name: "background-secondary", tag: "background", label: () => m.ui_theme_color_background_secondary() },
  { name: "background-secondary-alt", tag: "background", label: () => m.ui_theme_color_background_secondary_alt() },
  { name: "background-modifier-hover", tag: "background", label: () => m.ui_theme_color_background_modifier_hover() },
  {
    name: "background-modifier-active-hover",
    tag: "background",
    label: () => m.ui_theme_color_background_modifier_active_hover(),
  },
  { name: "background-modifier-border", tag: "border", label: () => m.ui_theme_color_background_modifier_border() },
  {
    name: "background-modifier-border-hover",
    tag: "border",
    label: () => m.ui_theme_color_background_modifier_border_hover(),
  },
  {
    name: "background-modifier-border-focus",
    tag: "border",
    label: () => m.ui_theme_color_background_modifier_border_focus(),
  },
  { name: "background-modifier-error", tag: "background", label: () => m.ui_theme_color_background_modifier_error() },
  {
    name: "background-modifier-error-hover",
    tag: "background",
    label: () => m.ui_theme_color_background_modifier_error_hover(),
  },
  {
    name: "background-modifier-success",
    tag: "background",
    label: () => m.ui_theme_color_background_modifier_success(),
  },
  {
    name: "background-modifier-message",
    tag: "background",
    label: () => m.ui_theme_color_background_modifier_message(),
  },
  { name: "interactive-normal", tag: "background", label: () => m.ui_theme_color_interactive_normal() },
  { name: "interactive-hover", tag: "background", label: () => m.ui_theme_color_interactive_hover() },
  { name: "interactive-accent", tag: "background", label: () => m.ui_theme_color_interactive_accent() },
  { name: "interactive-accent-hover", tag: "background", label: () => m.ui_theme_color_interactive_accent_hover() },
  { name: "text-normal", tag: "text", label: () => m.ui_theme_color_text_normal() },
  { name: "text-muted", tag: "text", label: () => m.ui_theme_color_text_muted() },
  { name: "text-faint", tag: "text", label: () => m.ui_theme_color_text_faint() },
  { name: "text-on-accent", tag: "text", label: () => m.ui_theme_color_text_on_accent() },
  { name: "text-on-accent-inverted", tag: "text", label: () => m.ui_theme_color_text_on_accent_inverted() },
  { name: "text-success", tag: "text", label: () => m.ui_theme_color_text_success() },
  { name: "text-warning", tag: "text", label: () => m.ui_theme_color_text_warning() },
  { name: "text-error", tag: "text", label: () => m.ui_theme_color_text_error() },
  { name: "text-accent", tag: "text", label: () => m.ui_theme_color_text_accent() },
  { name: "text-accent-hover", tag: "text", label: () => m.ui_theme_color_text_accent_hover() },
  { name: "text-selection", tag: "background", label: () => m.ui_theme_color_text_selection() },
  { name: "text-highlight-bg", tag: "background", label: () => m.ui_theme_color_text_highlight_bg() },
  { name: "caret-color", tag: "text", label: () => m.ui_theme_color_caret_color() },
];

// Tags a field of each role accepts, in the order they are shown. A border reads well in an
// accent or status color, and those live among the text-tagged variables (--text-accent,
// --text-error, --text-success); a decorative mark has no inherent ink-or-surface nature —
// so those two roles span two tags.
const ROLE_TAGS: Record<ThemeColorFieldRole, readonly ThemeColorTag[]> = {
  text: ["text"],
  background: ["background"],
  border: ["border", "text"],
  fill: ["text", "background"],
};

const LABELS = new Map(THEME_COLORS.map((color) => [color.name, color.label]));

export function themeColorGroupsFor(role: ThemeColorFieldRole): readonly ThemeColorGroup[] {
  return ROLE_TAGS[role].map((tag) => ({
    tag,
    names: THEME_COLORS.filter((color) => color.tag === tag).map((color) => color.name),
  }));
}

// A previously stored variable that is not a known theme color round-trips as its raw name.
export function themeColorLabel(name: string): string {
  return (LABELS.get(name) ?? (() => name))();
}
