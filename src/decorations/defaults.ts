import { match } from "ts-pattern";

import { DATE_CONDITION_ANY } from "./date-condition";

import type {
  BorderSide,
  ColorSettings,
  JournalDecoration,
  JournalDecorationCondition,
  JournalDecorationStyle,
} from "./config";

const transparentColor: ColorSettings = { type: "transparent" };
const textNormalColor: ColorSettings = { type: "theme", name: "text-normal" };
const defaultBorderSide = (show = false): BorderSide => ({
  show,
  width: 1,
  color: transparentColor,
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
    .with("background", () => ({ type: "background", color: transparentColor }))
    .with("color", () => ({ type: "color", color: textNormalColor }))
    .with("border", () => ({
      type: "border",
      border: "uniform",
      left: defaultBorderSide(true),
      right: defaultBorderSide(),
      top: defaultBorderSide(),
      bottom: defaultBorderSide(),
    }))
    .with("shape", () => ({
      type: "shape",
      size: 0.4,
      shape: "circle",
      color: transparentColor,
      placement_x: "center",
      placement_y: "bottom",
    }))
    .with("corner", () => ({ type: "corner", placement: "top-left", color: transparentColor }))
    .with("icon", () => ({
      type: "icon",
      icon: "",
      placement_x: "center",
      placement_y: "top",
      color: transparentColor,
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
    .exhaustive();
}
