import { CalendarDate, ordinalFor } from "@/calendar";
import { Err, Ok, type Result } from "@/infrastructure/result";

import { TemplateParseError } from "./errors";
import { escapeRegexLiteral, formatToRegexp, ordinalPattern } from "./format-regex";
import { applyModifiers, applyOffsets, unapplyModifiers } from "./modifiers";

import type { Modifier, VariableSpec } from "./types";

export const ORDINAL_FORMAT = "o";

export function renderString(spec: Extract<VariableSpec, { kind: "string" }>): string {
  return spec.value;
}

export function renderNumber(
  spec: Extract<VariableSpec, { kind: "number" }>,
  modifiers: readonly Modifier[] = [],
  format?: string,
): string {
  return formatNumber(applyOffsets(spec.value, modifiers), format);
}

export function renderDerived(
  spec: Extract<VariableSpec, { kind: "derived" }>,
  modifiers: readonly Modifier[],
  format?: string,
): string {
  const shifted = applyModifiers(spec.value, modifiers);
  return formatNumber(applyOffsets(spec.compute(shifted), modifiers), format);
}

function formatNumber(value: number, format?: string): string {
  return format === ORDINAL_FORMAT ? ordinalFor(value) : value.toString();
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
  const alternatives = "alternatives" in spec ? spec.alternatives : undefined;
  if (!alternatives || alternatives.length === 0) return naturalPatternForKind(spec, format);
  // A bound string's natural pattern is its own value, which is already one of the
  // alternatives when the value is the placeholder — the Set drops that duplicate.
  const branches = new Set([naturalPatternForKind(spec, format), ...alternatives.map((a) => escapeRegexLiteral(a))]);
  return [...branches].join("|");
}

function naturalPatternForKind(spec: VariableSpec, format?: string): string {
  switch (spec.kind) {
    case "string": {
      // A bound string (e.g. {{journal_name}}) has a known value; match it as a
      // literal so inversion can't capture arbitrary text in its place.
      return escapeRegexLiteral(spec.value);
    }
    case "number":
    case "derived": {
      // The suffix is optional: a locale whose ordinal() degrades to a bare number (see
      // ordinalFor) still round-trips, at the cost of also matching a plainly-numbered name.
      return format === ORDINAL_FORMAT ? String.raw`-?\d+` + `(?:${ordinalPattern})?` : String.raw`-?\d+`;
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
