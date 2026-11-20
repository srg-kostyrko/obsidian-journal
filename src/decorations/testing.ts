import { defaultCondition, defaultDecoration, defaultStyle } from "./defaults";

import type {
  CalendarDecoration,
  JournalDecoration,
  JournalDecorationCondition,
  JournalDecorationStyle,
} from "./config";
import type { CellDecorationState } from "./engine";

export function buildDecoration(overrides: Partial<JournalDecoration> = {}): JournalDecoration {
  return { ...defaultDecoration(), ...overrides };
}

export function buildCalendarDecoration(overrides: Partial<CalendarDecoration> = {}): CalendarDecoration {
  return { mode: "and", conditions: [], styles: [], ...overrides };
}

export function buildCondition<T extends JournalDecorationCondition["type"]>(
  type: T,
  overrides: Partial<Extract<JournalDecorationCondition, { type: T }>> = {},
): Extract<JournalDecorationCondition, { type: T }> {
  return { ...defaultCondition(type), ...overrides };
}

export function buildStyle<T extends JournalDecorationStyle["type"]>(
  type: T,
  overrides: Partial<Extract<JournalDecorationStyle, { type: T }>> = {},
): Extract<JournalDecorationStyle, { type: T }> {
  return { ...defaultStyle(type), ...overrides };
}

export function cellState(
  styles: readonly JournalDecorationStyle[],
  names: readonly string[] = [],
): CellDecorationState {
  return { styles, names };
}
