import { match } from "ts-pattern";

import { DATE_CONDITION_ANY } from "./date-condition";

import type {
  BorderSide,
  ColorSettings,
  JournalDecoration,
  JournalDecorationCondition,
  JournalDecorationStyle,
} from "./config";

// Every slot arrives visible. Under the last-wins cascade a transparent value is a declaration
// that cancels a broader scope's, not an absence, so an invisible default silently switches off
// a vault-wide rule. Theme variables rather than hex so a decoration follows the user's theme.
const accentFill: ColorSettings = { type: "theme", name: "interactive-accent" };
const accentInk: ColorSettings = { type: "theme", name: "text-accent" };
const defaultBorderSide = (): BorderSide => ({
  show: true,
  width: 1,
  color: accentInk,
  style: "solid",
});

export function defaultDecoration(): JournalDecoration {
  return { mode: "and", conditions: [], styles: [] };
}

export function defaultStyle<T extends JournalDecorationStyle["type"]>(
  type: T,
): Extract<JournalDecorationStyle, { type: T }>;
export function defaultStyle(type: JournalDecorationStyle["type"]): JournalDecorationStyle {
  return match<JournalDecorationStyle["type"], JournalDecorationStyle>(type)
    .with("background", () => ({ type: "background", color: accentFill }))
    .with("color", () => ({ type: "color", color: accentInk }))
    .with("border", () => ({
      type: "border",
      border: "uniform",
      left: defaultBorderSide(),
      right: defaultBorderSide(),
      top: defaultBorderSide(),
      bottom: defaultBorderSide(),
    }))
    .with("shape", () => ({
      type: "shape",
      size: 0.4,
      shape: "circle",
      color: accentInk,
      placement_x: "center",
      placement_y: "bottom",
    }))
    .with("corner", () => ({ type: "corner", placement: "top-left", color: accentInk }))
    .with("icon", () => ({
      type: "icon",
      // A stored icon name is user data typed into UiIconSuggest, so it stays a free-form
      // string rather than coming from src/ui/icons.ts.
      icon: "star",
      placement_x: "center",
      placement_y: "top",
      color: accentInk,
      size: 0.5,
    }))
    .exhaustive();
}

export function defaultCondition<T extends JournalDecorationCondition["type"]>(
  type: T,
): Extract<JournalDecorationCondition, { type: T }>;
export function defaultCondition(type: JournalDecorationCondition["type"]): JournalDecorationCondition {
  return match<JournalDecorationCondition["type"], JournalDecorationCondition>(type)
    .with("title", () => ({ type: "title", condition: "contains", value: "" }))
    .with("tag", () => ({ type: "tag", condition: "contains", value: "" }))
    .with("property", () => ({ type: "property", name: "", valueType: "text", condition: "exists", value: "" }))
    .with("date", () => ({ type: "date", day: DATE_CONDITION_ANY, month: DATE_CONDITION_ANY, year: null }))
    .with("weekday", () => ({ type: "weekday", weekdays: [] }))
    .with("offset", () => ({ type: "offset", offset: 1 }))
    .with("has-note", () => ({ type: "has-note" }))
    .with("has-open-task", () => ({ type: "has-open-task" }))
    .with("all-tasks-completed", () => ({ type: "all-tasks-completed" }))
    .with("note-size", () => ({ type: "note-size", unit: "words", condition: "gt", value: 0 }))
    .exhaustive();
}
