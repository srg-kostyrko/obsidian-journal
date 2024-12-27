import type { JournalDecorationCondition } from "@/types/settings.types";

export const decorationConditionTypeLabels: Record<JournalDecorationCondition["type"], string> = {
  title: "Check title",
  tag: "Check tags",
  property: "Check frontmatter property",
  date: "Check date",
  weekday: "Check weekday",
  offset: "Check interval offset",
  "has-note": "Check if note exists",
  "has-open-task": "Check if note has open tasks",
  "all-tasks-completed": "Check if all tasks are completed",
};

export const themeColors: Record<string, string> = {
  "background-primary": "Primary background",
  "background-primary-alt": "Background for surfaces on top of primary background",
  "background-secondary": "Secondary background",
  "background-secondary-alt": "Background for surfaces on top of secondary background",
  "background-modifier-hover": "Hovered elements",
  "background-modifier-active-hover": "Active hovered elements",
  "background-modifier-border": "Border color",
  "background-modifier-border-hover": "Border color (hover)",
  "background-modifier-border-focus": "Border color (focus)",
  "background-modifier-error-rgb": "Error background, RGB value",
  "background-modifier-error": "Error background",
  "background-modifier-error-hover": "Error background (hover)",
  "background-modifier-success-rgb": "Success background, RGB value",
  "background-modifier-success": "Success background",
  "background-modifier-message": "Messages background",
  "interactive-normal": "Background for standard interactive elements",
  "interactive-hover": "Background for standard interactive elements (hover)",
  "interactive-accent": "Background for accented interactive elements",
  "interactive-accent-hover": "Background for accented interactive elements (hover)",
  "text-normal": "Normal text",
  "text-muted": "Muted text",
  "text-faint": "Faint text",
  "text-on-accent": "Text on accent background when accent is dark",
  "text-on-accent-inverted": "Text on accent background when accent is light",
  "text-success": "Success text",
  "text-warning": "Warning text",
  "text-error": "Error text",
  "text-accent": "Accent text",
  "text-accent-hover": "Accent text (hover)",
  "text-selection": "Selected text background",
  "text-highlight-bg": "Highlighted text background",
  "caret-color": "Caret color",
};