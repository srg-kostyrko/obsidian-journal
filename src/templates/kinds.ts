import { CalendarDate } from "@/calendar";
import { Err, Ok, type Result } from "@/infrastructure/result";

import { TemplateParseError } from "./errors";
import { formatToRegexp } from "./format-regex";
import { applyModifiers, unapplyModifiers } from "./modifiers";

import type { Modifier, VariableSpec } from "./types";

export function renderString(spec: Extract<VariableSpec, { kind: "string" }>): string {
  return spec.value;
}

export function renderNumber(spec: Extract<VariableSpec, { kind: "number" }>): string {
  return spec.value.toString();
}

export function renderDate(
  spec: Extract<VariableSpec, { kind: "date" }>,
  modifiers: readonly Modifier[],
  format?: string,
): string {
  const shifted = applyModifiers(spec.value, modifiers);
  return shifted.format(format ?? spec.defaultFormat);
}

export function renderClock(
  spec: Extract<VariableSpec, { kind: "clock" }>,
  modifiers: readonly Modifier[],
  format?: string,
): string {
  const shifted = applyModifiers(spec.value, modifiers);
  return shifted.format(format ?? spec.defaultFormat);
}

export function patternForKind(spec: VariableSpec, format?: string): string {
  switch (spec.kind) {
    case "string": {
      return ".+?";
    }
    case "number": {
      return String.raw`-?\d+`;
    }
    case "date": {
      const effective = format ?? spec.defaultFormat;
      return formatToRegexp(effective).source;
    }
    case "clock": {
      return ".+?";
    }
  }
}

export function parseString(capture: string, _variableName: string): Result<string, TemplateParseError> {
  return new Ok(capture);
}

export function parseNumber(capture: string, variableName: string): Result<number, TemplateParseError> {
  const value = Number.parseInt(capture, 10);
  if (Number.isNaN(value)) {
    return new Err(new TemplateParseError({ kind: "invalid-number", capture, variableName }));
  }
  return new Ok(value);
}

export function parseDate(
  capture: string,
  format: string,
  modifiers: readonly Modifier[],
  variableName: string,
): Result<CalendarDate, TemplateParseError> {
  const parsed = CalendarDate.parse(capture, format);
  if (parsed.kind === "err") {
    return new Err(new TemplateParseError({ kind: "invalid-date", capture, variableName, format }));
  }
  return new Ok(unapplyModifiers(parsed.value, modifiers));
}
