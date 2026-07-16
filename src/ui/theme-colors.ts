import { m } from "@/i18n";

// Obsidian theme CSS-variable names offered by the theme color picker. The variable name
// is the identifier stored in settings; the dropdown shows a friendly label with a live swatch.
export const THEME_COLOR_NAMES: readonly string[] = [
  "background-primary",
  "background-primary-alt",
  "background-secondary",
  "background-secondary-alt",
  "background-modifier-hover",
  "background-modifier-active-hover",
  "background-modifier-border",
  "background-modifier-border-hover",
  "background-modifier-border-focus",
  "background-modifier-error-rgb",
  "background-modifier-error",
  "background-modifier-error-hover",
  "background-modifier-success-rgb",
  "background-modifier-success",
  "background-modifier-message",
  "interactive-normal",
  "interactive-hover",
  "interactive-accent",
  "interactive-accent-hover",
  "text-normal",
  "text-muted",
  "text-faint",
  "text-on-accent",
  "text-on-accent-inverted",
  "text-success",
  "text-warning",
  "text-error",
  "text-accent",
  "text-accent-hover",
  "text-selection",
  "text-highlight-bg",
  "caret-color",
];

// Friendly labels for the known theme variables (v2 parity). Kept as arrow wrappers so each
// paraglide message is referenced statically (tree-shakeable) and read at the active locale.
const THEME_COLOR_LABELS: Record<string, () => string> = {
  "background-primary": () => m.ui_theme_color_background_primary(),
  "background-primary-alt": () => m.ui_theme_color_background_primary_alt(),
  "background-secondary": () => m.ui_theme_color_background_secondary(),
  "background-secondary-alt": () => m.ui_theme_color_background_secondary_alt(),
  "background-modifier-hover": () => m.ui_theme_color_background_modifier_hover(),
  "background-modifier-active-hover": () => m.ui_theme_color_background_modifier_active_hover(),
  "background-modifier-border": () => m.ui_theme_color_background_modifier_border(),
  "background-modifier-border-hover": () => m.ui_theme_color_background_modifier_border_hover(),
  "background-modifier-border-focus": () => m.ui_theme_color_background_modifier_border_focus(),
  "background-modifier-error-rgb": () => m.ui_theme_color_background_modifier_error_rgb(),
  "background-modifier-error": () => m.ui_theme_color_background_modifier_error(),
  "background-modifier-error-hover": () => m.ui_theme_color_background_modifier_error_hover(),
  "background-modifier-success-rgb": () => m.ui_theme_color_background_modifier_success_rgb(),
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
};

// A previously stored variable that is not a known theme color round-trips as its raw name.
export function themeColorLabel(name: string): string {
  return (THEME_COLOR_LABELS[name] ?? (() => name))();
}
