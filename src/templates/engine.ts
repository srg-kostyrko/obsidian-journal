import { match } from "ts-pattern";

import { CalendarDate, localMoment } from "@/calendar";
import { inject, InjectorToken } from "@/infrastructure/di";
import { Err, Ok, type Result } from "@/infrastructure/result";

import { TemplateParseError } from "./errors";
import { tokenize } from "./grammar";
import { FunctionHandlerToken, type FunctionHandler } from "./handlers";
import {
  ORDINAL_FORMAT,
  parseDate,
  parseNumber,
  parseString,
  patternForKind,
  renderClock,
  renderDate,
  renderDerived,
  renderNumber,
  renderString,
} from "./kinds";
import { applyModifiers, isBoundaryUnit, unapplyModifiers, unapplyOffsets } from "./modifiers";

import type { TemplateContext } from "./context";
import type { Bindings, BoundValue, Modifier, Token, TokenStream, ValidationProblem, VariableSpec } from "./types";

export class TemplateEngine {
  readonly #injector = inject(InjectorToken);
  #handlersByName?: ReadonlyMap<string, FunctionHandler>;

  // Resolved lazily on first render, not at construction: a handler
  // (JournalLinkHandler) depends on this engine transitively via NotePathService,
  // so eager resolution would form a DI cycle and abort plugin load.
  #handlers(): ReadonlyMap<string, FunctionHandler> {
    return (this.#handlersByName ??= new Map(this.#injector.resolve(FunctionHandlerToken).map((h) => [h.name, h])));
  }

  #renderToken(token: Token, context: TemplateContext): string {
    return match(token)
      .with({ kind: "literal" }, (t) => t.text)
      .with({ kind: "variable" }, (t) => this.#renderVariable(t, context))
      .with({ kind: "function" }, (t) => this.#renderFunction(t, context))
      .exhaustive();
  }

  #renderVariable(token: Extract<Token, { kind: "variable" }>, context: TemplateContext): string {
    const spec = context.get(token.name);
    if (!spec) return token.raw;
    if (spec.kind === "number") {
      if (!isRenderableNumberToken(token)) return token.raw;
    } else if (spec.kind === "derived") {
      if (!hasNumberFormat(token)) return token.raw;
    } else if (
      // A string variable takes neither modifiers nor a format; emit the raw token unchanged.
      spec.kind !== "date" &&
      spec.kind !== "clock" &&
      (token.modifiers.length > 0 || token.format !== undefined)
    ) {
      return token.raw;
    }
    return match(spec)
      .with({ kind: "string" }, (s) => renderString(s))
      .with({ kind: "number" }, (s) => renderNumber(s, token.modifiers, token.format))
      .with({ kind: "derived" }, (s) => renderDerived(s, token.modifiers, token.format))
      .with({ kind: "date" }, (s) => renderDate(s, token.modifiers, token.format))
      .with({ kind: "clock" }, (s) => renderClock(s, token.modifiers, token.format))
      .exhaustive();
  }

  #renderFunction(token: Extract<Token, { kind: "function" }>, context: TemplateContext): string {
    const handler = this.#handlers().get(token.name);
    if (!handler) return token.raw;
    const result = handler.render({
      arg: token.arg,
      sourceDate: this.#sourceDateFor(context),
      modifiers: token.modifiers,
      format: token.format,
      context,
      engine: this,
    });
    if (result.kind === "err") return token.raw;
    return result.value;
  }

  #sourceDateFor(context: TemplateContext): CalendarDate {
    const spec = context.get("date");
    return spec?.kind === "date" ? spec.value : CalendarDate.today();
  }

  #compileMatcher(
    stream: TokenStream,
    context: TemplateContext,
  ): Result<{ regex: RegExp; captureTokens: Extract<Token, { kind: "variable" }>[] }, TemplateParseError> {
    const parts: string[] = ["^"];
    const captureTokens: Extract<Token, { kind: "variable" }>[] = [];

    for (const token of stream) {
      if (token.kind === "literal") {
        parts.push(escapeRegex(token.text));
        continue;
      }
      if (token.kind === "function") {
        return new Err(
          new TemplateParseError({ kind: "not-invertible", reason: "function-token", offending: token.name }),
        );
      }
      const spec = context.get(token.name);
      if (isWildcard(spec)) {
        parts.push(".+?");
        continue;
      }
      if (!spec) {
        return new Err(
          new TemplateParseError({ kind: "not-invertible", reason: "unknown-variable", offending: token.name }),
        );
      }
      if (spec.kind === "derived") {
        parts.push(`(?:${patternForKind(spec, token.format)})`);
        continue;
      }
      const captureIndex = captureTokens.length;
      const pattern = patternForKind(spec, token.format);
      parts.push(`(?<v_${captureIndex}>${pattern})`);
      captureTokens.push(token);
    }
    parts.push("$");
    return new Ok({ regex: new RegExp(parts.join("")), captureTokens });
  }

  #parseCapture(
    capture: string,
    spec: Exclude<VariableSpec, { kind: "derived" }>,
    token: Extract<Token, { kind: "variable" }>,
  ): Result<BoundValue, TemplateParseError> {
    // An alternative is a literal the slot admits in place of a real value — the creation-prompt
    // placeholder, or a select prompt's own values. It is never the spec's own kind, so parsing it
    // as one would fail; hand it back as text and let the caller decide what it means.
    const alternatives = "alternatives" in spec ? spec.alternatives : undefined;
    if (alternatives?.includes(capture)) return new Ok({ kind: "string", value: capture });
    const ok = (value: BoundValue): Result<BoundValue, TemplateParseError> => new Ok(value);
    const err = (error: TemplateParseError): Result<BoundValue, TemplateParseError> => new Err(error);
    return match(spec)
      .with({ kind: "string" }, () => {
        const result = parseString(capture, token.name);
        return result.kind === "ok" ? ok({ kind: "string", value: result.value }) : err(result.error);
      })
      .with({ kind: "number" }, () => {
        const result = parseNumber(capture, token.name);
        return result.kind === "ok"
          ? ok({ kind: "number", value: unapplyOffsets(result.value, token.modifiers) })
          : err(result.error);
      })
      .with({ kind: "date" }, (dateSpec) => {
        const format = token.format ?? dateSpec.defaultFormat;
        const result = parseDate(capture, format, token.modifiers, token.name);
        if (result.kind === "err") return err(result.error);
        // Arithmetic-shift modifiers were already unapplied by parseDate; what remains is
        // unmodified or boundary-only, which lowerBoundOf answers for.
        return ok({ kind: "date", value: lowerBoundOf(result.value, token.modifiers) });
      })
      .with({ kind: "clock" }, () =>
        err(new TemplateParseError({ kind: "not-invertible", reason: "clock-variable", offending: token.name })),
      )
      .exhaustive();
  }

  // Every capture read on its own, requiring the normalized lower bounds to agree. What is left
  // when neither combining components nor rendering a whole path back can answer.
  #mergeIndependently(name: string, entries: DateCapture[]): Result<BoundValue, TemplateParseError> {
    const parsed: BoundValue[] = [];
    for (const entry of entries) {
      const value = this.#parseCapture(entry.capture, entry.spec, entry.token);
      if (value.kind === "err") return new Err(value.error);
      parsed.push(value.value);
    }
    return mergeCandidates(name, parsed);
  }

  #resolveDate(name: string, entries: DateCapture[]): Result<BoundValue, TemplateParseError> {
    if (entries.length === 1) {
      return this.#parseCapture(entries[0].capture, entries[0].spec, entries[0].token);
    }
    // Combining relies on moment reassembling components from one format string, which can't
    // account for arithmetic/boundary modifiers: captures under different modifiers render
    // different dates and are not components of one value. Those go to the search below, which
    // reads each modifier chain on its own and keeps the date the whole path renders back from.
    if (entries.some((entry) => entry.token.modifiers.length > 0)) {
      const found = dateRenderingPath(entries);
      if (found) return new Ok({ kind: "date", value: found });
      return this.#mergeIndependently(name, entries);
    }
    const fieldSets = entries.map((entry) => dateFields(entry.format));
    if (fieldSets.includes(undefined) || !weekdayPinned(fieldSets)) {
      return this.#mergeIndependently(name, entries);
    }
    const definiteFields = withWeekYearReading(
      fieldSets.filter((fields): fields is Set<DateField> => fields !== undefined),
    );
    const combinedInput = entries.map((entry) => entry.capture).join(DATE_PART_SEP);
    const combinedFormat = entries.map((entry) => entry.format).join(`[${DATE_PART_SEP}]`);
    const combined = CalendarDate.parse(combinedInput, combinedFormat);
    if (combined.kind === "err") {
      return new Err(
        new TemplateParseError({
          kind: "invalid-date",
          capture: combinedInput,
          variableName: name,
          format: combinedFormat,
        }),
      );
    }
    const merged = combined.value;
    // moment silently lets a later component override an earlier one; verify each token's
    // own fields still agree with the merged date so contradictory captures conflict.
    const candidates: BoundValue[] = [];
    for (const [index, entry] of entries.entries()) {
      // A capture read on its own loses what the rest of the path supplies: a week number has no
      // week-year to count in, so week 53 is refused whenever the current year has 52, and a bare year
      // lands on 1 January, whose week-year can be the previous one. The merged date rendering back to
      // the capture is agreement outright; only a capture it does not reproduce is read alone.
      if (merged.format(entry.format) === entry.capture) {
        candidates.push({ kind: "date", value: merged });
        continue;
      }
      const own = CalendarDate.parse(entry.capture, entry.format);
      if (own.kind === "err") {
        return new Err(
          new TemplateParseError({
            kind: "invalid-date",
            capture: entry.capture,
            variableName: name,
            format: entry.format,
          }),
        );
      }
      candidates.push({ kind: "date", value: own.value });
      if (!fieldsAgree(definiteFields[index], own.value, merged)) {
        return new Err(new TemplateParseError({ kind: "conflict", variableName: name, candidates }));
      }
    }
    return new Ok({ kind: "date", value: merged });
  }

  renderString(template: string, context: TemplateContext): string {
    return this.renderStream(tokenize(template), context);
  }

  renderStream(stream: TokenStream, context: TemplateContext): string {
    let output = "";
    for (const token of stream) {
      output += this.#renderToken(token, context);
    }
    return output;
  }

  validate(
    stream: TokenStream,
    context: TemplateContext,
    options: { allowFunctions?: boolean } = {},
  ): ValidationProblem[] {
    const allowFunctions = options.allowFunctions ?? false;
    const problems: ValidationProblem[] = [];
    let position = 0;
    for (const token of stream) {
      if (token.kind === "literal") {
        position += token.text.length;
        continue;
      }
      if (token.kind === "function") {
        if (!allowFunctions) {
          problems.push({ token, position, problem: "function-not-allowed" });
        } else if (!this.#handlers().has(token.name)) {
          problems.push({ token, position, problem: "unknown-function" });
        }
        position += token.raw.length;
        continue;
      }
      const spec = context.get(token.name);
      if (!spec) {
        problems.push({ token, position, problem: "unknown-variable" });
        position += token.raw.length;
        continue;
      }
      if (spec.kind === "number") {
        if (token.format !== undefined && token.format !== ORDINAL_FORMAT) {
          problems.push({ token, position, problem: "unsupported-number-format" });
        }
        if (token.modifiers.some((modifier) => modifier.kind !== "offset")) {
          problems.push({ token, position, problem: "modifiers-on-non-date" });
        }
      } else if (spec.kind === "derived") {
        if (!hasNumberFormat(token)) {
          problems.push({ token, position, problem: "unsupported-number-format" });
        }
        for (const modifier of token.modifiers) {
          if (modifier.kind === "boundary" && !isBoundaryUnit(modifier.unit)) {
            problems.push({ token, position, problem: "unknown-unit" });
          }
        }
      } else if (spec.kind !== "date" && spec.kind !== "clock") {
        if (token.format !== undefined) {
          problems.push({ token, position, problem: "format-on-non-date" });
        }
        if (token.modifiers.length > 0) {
          problems.push({ token, position, problem: "modifiers-on-non-date" });
        }
      } else {
        // The grammar accepts any word as a boundary unit, and applyModifier drops one it does
        // not understand — leaving the date silently unsnapped rather than wrong in a way anyone
        // could see. This problem type was declared from the start and never raised.
        for (const modifier of token.modifiers) {
          if (modifier.kind === "offset") {
            problems.push({ token, position, problem: "offset-on-date" });
          } else if (modifier.kind === "boundary" && !isBoundaryUnit(modifier.unit)) {
            problems.push({ token, position, problem: "unknown-unit" });
          }
        }
      }
      position += token.raw.length;
    }
    return problems;
  }

  parse(stream: TokenStream, input: string, context: TemplateContext): Result<Bindings, TemplateParseError> {
    const compiled = this.#compileMatcher(stream, context);
    if (compiled.kind === "err") return new Err(compiled.error);
    const { regex, captureTokens } = compiled.value;
    const matched = regex.exec(input);
    if (!matched) {
      return new Err(new TemplateParseError({ kind: "no-match", input }));
    }
    // A stream with no variable tokens compiles to a regex with no named groups, so `.groups` is
    // undefined even on a successful match (JS regex semantics key `.groups` off the pattern, not
    // the match). That is exactly the case where captureTokens is empty, so the loop below never
    // runs and the optional read never resolves.
    const groups = matched.groups;

    const candidates = new Map<string, BoundValue[]>();
    // Date tokens are resolved together per variable: a date split across tokens
    // (e.g. {{date:YYYY}}/{{date:MM}}/{{date:DD}}) must combine into one value
    // rather than have each token parse to a full moment-defaulted date.
    const dateTokens = new Map<string, DateCapture[]>();
    for (const [index, token] of captureTokens.entries()) {
      const capture = groups?.[`v_${index}`];
      if (capture === undefined) continue;
      const spec = context.get(token.name);
      if (!spec || spec.kind === "derived") continue;
      // Key by the defined name, not the token's spelling: `{{Date}}` binds `date`, which is
      // what every caller reads.
      const name = context.canonicalName(token.name) ?? token.name;
      if (spec.kind === "date") {
        const list = dateTokens.get(name) ?? [];
        list.push({ token, spec, capture, format: token.format ?? spec.defaultFormat });
        dateTokens.set(name, list);
        continue;
      }
      const value = this.#parseCapture(capture, spec, token);
      if (value.kind === "err") return new Err(value.error);
      const list = candidates.get(name) ?? [];
      list.push(value.value);
      candidates.set(name, list);
    }

    const resolved = new Map<string, BoundValue>();
    for (const [name, list] of candidates) {
      const merged = mergeCandidates(name, list);
      if (merged.kind === "err") return new Err(merged.error);
      resolved.set(name, merged.value);
    }
    for (const [name, entries] of dateTokens) {
      const merged = this.#resolveDate(name, entries);
      if (merged.kind === "err") return new Err(merged.error);
      resolved.set(name, merged.value);
    }
    return new Ok(resolved);
  }
}

interface DateCapture {
  token: Extract<Token, { kind: "variable" }>;
  spec: Extract<VariableSpec, { kind: "date" }>;
  capture: string;
  format: string;
}

type DateField = "year" | "weekYear" | "month" | "day" | "quarter" | "week" | "isoWeek" | "dayOfYear" | "weekday";

// How each field is read off a date, so a token's own capture can be checked against the combined
// parse whatever calendar unit it names. moment is the only thing that answers for the week and
// quarter units, so every field goes through it rather than through CalendarDate's y/m/d.
const FIELD_READERS: Record<DateField, (m: ReturnType<typeof localMoment>) => number> = {
  year: (m) => m.year(),
  weekYear: (m) => m.weekYear(),
  month: (m) => m.month(),
  day: (m) => m.date(),
  quarter: (m) => m.quarter(),
  week: (m) => m.week(),
  isoWeek: (m) => m.isoWeek(),
  dayOfYear: (m) => m.dayOfYear(),
  weekday: (m) => m.day(),
};

// A separator that can't occur inside a captured date component, so combining
// component captures into one moment parse stays unambiguous.
const DATE_PART_SEP = "\u{0}";

// The format a reference date is written in when it is parsed ahead of a chain's own captures.
const REFERENCE_FORMAT = "YYYY-MM-DD";

// The calendar fields a date format constrains, or undefined if it names a day-of-month ordinal,
// whose capture moment will not read back out of a combined format. That routes back to the
// agreement-based merge instead.
function dateFields(format: string): Set<DateField> | undefined {
  const fields = new Set<DateField>();
  let inLiteral = false;
  let symbol = "";
  let count = 0;
  let unsupported = false;
  const flush = () => {
    if (count === 0) return;
    const named = match(symbol)
      .returnType<DateField | "unreconcilable" | "no-field">()
      .with("Y", () => "year")
      .with("g", "G", () => "weekYear")
      .with("M", () => "month")
      .with("Q", () => "quarter")
      .with("w", () => "week")
      .with("W", () => "isoWeek")
      .with("D", () => (count < 3 ? "day" : "dayOfYear"))
      .with("d", () => "weekday")
      .with("e", "E", "o", () => "unreconcilable")
      .otherwise(() => "no-field");
    if (named === "unreconcilable") unsupported = true;
    else if (named !== "no-field") fields.add(named);
    count = 0;
    symbol = "";
  };
  for (const char of format) {
    if (inLiteral) {
      if (char === "]") inLiteral = false;
      continue;
    }
    if (char === "[") {
      flush();
      inLiteral = true;
    } else if (char === symbol) {
      count++;
    } else {
      flush();
      symbol = char;
      count = 1;
    }
  }
  flush();
  return unsupported ? undefined : fields;
}

// A weekday from the d family (d/dd/ddd/dddd, the only tokens moment validates against the date)
// is redundant beside a day of the month, and moment refuses a combined date the weekday
// contradicts. Without one it names no date at all: moment resolves it within the current week,
// overriding even a day of the year, so only a day of the month lets the captures combine.
function weekdayPinned(fieldSets: (Set<DateField> | undefined)[]): boolean {
  return fieldSets.every((fields) => !fields?.has("weekday")) || fieldSets.some((fields) => fields?.has("day"));
}

// The date a path names when its captures of that date do not all carry the same modifiers. Captures
// sharing a chain of modifiers describe one value and combine as components of it; each chain is then
// read back to the date it was rendered from, and the answer is the earliest such reading that renders
// every capture in the path back exactly. Reading a chain against another chain's date supplies the
// components its own formats never name — "MMM D" has no year — which moment would otherwise take
// from today.
function dateRenderingPath(entries: DateCapture[]): CalendarDate | undefined {
  const chains = [...groupByModifiers(entries).values()];
  const readings = chains
    .map((chain) => readChain(chain))
    .filter((reading): reading is CalendarDate => reading !== undefined);
  const candidates = new Map<string, CalendarDate>();
  for (const reading of readings) candidates.set(reading.toAnchor(), reading);
  for (const reference of readings) {
    for (const chain of chains) {
      const seeded = readChain(chain, reference);
      if (seeded) candidates.set(seeded.toAnchor(), seeded);
    }
  }
  // Ties go to the earliest date: a path built from boundaries names a range, and every day in it
  // renders the same path.
  return [...candidates.values()]
    .toSorted((a, b) => a.compareTo(b))
    .find((candidate) => entries.every((entry) => rendersBack(entry, candidate)));
}

// Grouped on the chain as written: two chains that mean the same date by a different spelling are
// read as two, which costs a reading and nothing else — the verification below decides between them.
function groupByModifiers(entries: DateCapture[]): Map<string, DateCapture[]> {
  const chains = new Map<string, DateCapture[]>();
  for (const entry of entries) {
    const key = JSON.stringify(entry.token.modifiers);
    const chain = chains.get(key) ?? [];
    chain.push(entry);
    chains.set(key, chain);
  }
  return chains;
}

// One chain's captures as a date, brought back to the value they were rendered from: shifts
// unapplied and a bare <endOf=unit> taken to the start of the unit it ends, the lower bound
// #parseCapture normalizes to. A reference date, when given, is parsed ahead of the captures so
// they override only the components they name.
function readChain(chain: DateCapture[], reference?: CalendarDate): CalendarDate | undefined {
  const captures = chain.map((entry) => entry.capture);
  const formats = chain.map((entry) => entry.format);
  if (reference) {
    captures.unshift(reference.toAnchor());
    formats.unshift(REFERENCE_FORMAT);
  }
  const parsed = CalendarDate.parse(captures.join(DATE_PART_SEP), formats.join(`[${DATE_PART_SEP}]`));
  if (parsed.kind === "err") return undefined;
  const modifiers = chain[0].token.modifiers;
  return lowerBoundOf(unapplyModifiers(parsed.value, modifiers), modifiers);
}

// Normalize to "lower bound of source range" so two readings of one date compare equal. A bare
// `<endOf=unit>` makes a parsed value the upper bound of its source's range; bring it back to the
// range start. Bare `<startOf=unit>` already IS the lower bound.
function lowerBoundOf(date: CalendarDate, modifiers: readonly Modifier[]): CalendarDate {
  let value = date;
  for (const modifier of modifiers) {
    if (modifier.kind === "boundary" && modifier.direction === "end" && isBoundaryUnit(modifier.unit)) {
      value = value.startOf(modifier.unit);
    }
  }
  return value;
}

function rendersBack(entry: DateCapture, date: CalendarDate): boolean {
  return applyModifiers(date, entry.token.modifiers).format(entry.format) === entry.capture;
}

function fieldsAgree(fields: Set<DateField>, a: CalendarDate, b: CalendarDate): boolean {
  const left = localMoment(a.toAnchor(), "YYYY-MM-DD", true);
  const right = localMoment(b.toAnchor(), "YYYY-MM-DD", true);
  for (const field of fields) {
    const read = FIELD_READERS[field];
    if (read(left) !== read(right)) return false;
  }
  return true;
}

// moment consumes a plain year token as the *week*-year once a week token shares the format, and
// that is the reading the renderer writes: WeekPeriod renders its tokens from a representative day
// picked so {{date:YYYY}} is the week-year. So a year captured alongside a week has to be verified
// as a week-year too, or a week starting in the previous calendar year reads as a conflict.
function withWeekYearReading(fieldSets: Set<DateField>[]): Set<DateField>[] {
  const hasWeek = fieldSets.some((fields) => fields.has("week") || fields.has("isoWeek"));
  if (!hasWeek) return fieldSets;
  return fieldSets.map((fields) => {
    if (!fields.has("year")) return fields;
    const next = new Set(fields);
    next.delete("year");
    next.add("weekYear");
    return next;
  });
}

function isRenderableNumberToken(token: Extract<Token, { kind: "variable" }>): boolean {
  return token.modifiers.every((modifier) => modifier.kind === "offset") && hasNumberFormat(token);
}

function hasNumberFormat(token: Extract<Token, { kind: "variable" }>): boolean {
  return token.format === undefined || token.format === ORDINAL_FORMAT;
}

function isWildcard(spec: VariableSpec | undefined): boolean {
  return spec?.kind === "clock" || (spec?.kind === "date" && spec.invertible === false);
}

function escapeRegex(source: string): string {
  return source.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function mergeCandidates(name: string, candidates: BoundValue[]): Result<BoundValue, TemplateParseError> {
  if (candidates.length === 1) return new Ok(candidates[0]);
  const first = candidates[0];

  if (first.kind === "string" || first.kind === "number") {
    for (const candidate of candidates) {
      if (candidate.kind !== first.kind || candidate.value !== (first as { value: unknown }).value) {
        return new Err(new TemplateParseError({ kind: "conflict", variableName: name, candidates }));
      }
    }
    return new Ok(first);
  }

  // dates: every candidate has been normalized to "lower bound of source range"
  // in #parseCapture. All candidates must agree on that lower bound.
  const firstAnchor = first.value.toAnchor();
  for (const candidate of candidates) {
    if (candidate.kind !== "date" || candidate.value.toAnchor() !== firstAnchor) {
      return new Err(new TemplateParseError({ kind: "conflict", variableName: name, candidates }));
    }
  }
  return new Ok(first);
}
