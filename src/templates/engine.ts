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
import { isBoundaryUnit, unapplyOffsets } from "./modifiers";

import type { TemplateContext } from "./context";
import type { Bindings, BoundValue, Token, TokenStream, ValidationProblem, VariableSpec } from "./types";

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
        // Normalize to "lower bound of source range" so multi-binding resolution
        // can compare candidates by value equality. A bare `<endOf=unit>` modifier
        // makes parsed value the upper bound of the source's range; bring it back
        // to the range start. Bare `<startOf=unit>` already IS the lower bound.
        // Arithmetic-shift modifiers were already unapplied by parseDate; what
        // remains is unmodified or boundary-only.
        let lowerBound = result.value;
        for (const modifier of token.modifiers) {
          if (modifier.kind === "boundary" && modifier.direction === "end" && isBoundaryUnit(modifier.unit)) {
            lowerBound = lowerBound.startOf(modifier.unit);
          }
        }
        return ok({ kind: "date", value: lowerBound });
      })
      .with({ kind: "clock" }, () =>
        err(new TemplateParseError({ kind: "not-invertible", reason: "clock-variable", offending: token.name })),
      )
      .exhaustive();
  }

  #resolveDate(name: string, entries: DateCapture[]): Result<BoundValue, TemplateParseError> {
    if (entries.length === 1) {
      return this.#parseCapture(entries[0].capture, entries[0].spec, entries[0].token);
    }
    // Combining relies on moment reassembling components from one format string, which
    // can't account for arithmetic/boundary modifiers. When any token carries a modifier
    // (e.g. a week's <startOf>/<endOf> pair), fall back to parsing each independently and
    // requiring the normalized lower bounds to agree.
    const noModifiers = entries.every((entry) => entry.token.modifiers.length === 0);
    const fieldSets = noModifiers ? entries.map((entry) => dateFields(entry.format)) : undefined;
    if (!fieldSets || fieldSets.includes(undefined)) {
      const parsed: BoundValue[] = [];
      for (const entry of entries) {
        const value = this.#parseCapture(entry.capture, entry.spec, entry.token);
        if (value.kind === "err") return new Err(value.error);
        parsed.push(value.value);
      }
      return mergeCandidates(name, parsed);
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
    // A stream with no variable tokens compiles to a regex with no named groups at
    // all, so `.groups` is `undefined` even on a successful match (JS regex semantics
    // key `.groups` off the pattern, not the match) — fall back to {} rather than
    // treating a matching pure-literal template as a parse failure.
    const groups = matched.groups ?? {};

    const candidates = new Map<string, BoundValue[]>();
    // Date tokens are resolved together per variable: a date split across tokens
    // (e.g. {{date:YYYY}}/{{date:MM}}/{{date:DD}}) must combine into one value
    // rather than have each token parse to a full moment-defaulted date.
    const dateTokens = new Map<string, DateCapture[]>();
    for (const [index, token] of captureTokens.entries()) {
      const capture = groups[`v_${index}`];
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

type DateField = "year" | "weekYear" | "month" | "day" | "quarter" | "week" | "isoWeek" | "dayOfYear";

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
};

// A separator that can't occur inside a captured date component, so combining
// component captures into one moment parse stays unambiguous.
const DATE_PART_SEP = "\u{0}";

// The calendar fields a date format constrains, or undefined if it names a unit this component
// combiner can't reconcile — a weekday or a day-of-month ordinal, neither of which a year and a
// period-within-the-year pin down. Those route back to the agreement-based merge instead.
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
      // A weekday ("d", "e", "E") names no period a year can complete, and "o" is a day-of-month
      // ordinal whose own capture moment will not read back out of a combined format.
      .with("d", "e", "E", "o", () => "unreconcilable")
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
