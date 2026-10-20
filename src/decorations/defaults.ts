import { match } from "ts-pattern";

import {
  accentFill,
  accentInk,
  defaultBorderSide,
  type JournalDecoration,
  type JournalDecorationCondition,
  type JournalDecorationStyle,
} from "./config";
import { DATE_CONDITION_ANY } from "./date-condition";

export function defaultDecoration(): JournalDecoration {
  return { mode: "and", conditions: [], styles: [] };
}

export function defaultStyle<T extends JournalDecorationStyle["type"]>(
  type: T,
): Extract<JournalDecorationStyle, { type: T }>;
export function defaultStyle(type: JournalDecorationStyle["type"]): JournalDecorationStyle {
  return match<JournalDecorationStyle["type"], JournalDecorationStyle>(type)
    .with("background", () => ({ type: "background", color: accentFill() }))
    .with("color", () => ({ type: "color", color: accentInk() }))
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
      color: accentInk(),
      placement_x: "center",
      placement_y: "bottom",
    }))
    .with("corner", () => ({ type: "corner", placement: "top-left", color: accentInk() }))
    .with("icon", () => ({
      type: "icon",
      // A stored icon name is user data typed into UiIconSuggest, so it stays a free-form
      // string rather than coming from src/ui/icons.ts.
      icon: "star",
      placement_x: "center",
      placement_y: "top",
      color: accentInk(),
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
    .with("tasks", () => ({
      type: "tasks",
      quantifier: "any",
      status: "listing",
      source: "both",
      date: "scheduled-or-due",
      filter: { mode: "and", conditions: [] },
    }))
    .with("note-size", () => ({ type: "note-size", unit: "words", condition: "gt", value: 0 }))
    .with("has-notelet", () => ({ type: "has-notelet" as const, typeIds: [] }))
    .exhaustive();
}
