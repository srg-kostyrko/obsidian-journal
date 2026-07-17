import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import { inject, InjectorToken } from "@/infrastructure/di";
import { Err, Ok, type Result } from "@/infrastructure/result";

import { TemplateParseError } from "./errors";
import { tokenize } from "./grammar";
import { FunctionHandlerToken, type FunctionHandler } from "./handlers";
import {
  parseDate,
  parseNumber,
  parseString,
  patternForKind,
  renderClock,
  renderDate,
  renderNumber,
  renderString,
} from "./kinds";
import { isBoundaryUnit } from "./modifiers";

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
    // v2 fidelity: modifiers and :format are only meaningful on date/clock kinds.
    // For string/number variables with either present, emit the raw token unchanged.
    if (spec.kind !== "date" && spec.kind !== "clock" && (token.modifiers.length > 0 || token.format !== undefined)) {
      return token.raw;
    }
    return match(spec)
      .with({ kind: "string" }, (s) => renderString(s))
      .with({ kind: "number" }, (s) => renderNumber(s))
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
    spec: VariableSpec,
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
        return result.kind === "ok" ? ok({ kind: "number", value: result.value }) : err(result.error);
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
      if (spec.kind !== "date" && spec.kind !== "clock") {
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
          if (modifier.kind === "boundary" && !isBoundaryUnit(modifier.unit)) {
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
    for (const [index, token] of captureTokens.entries()) {
      const capture = groups[`v_${index}`];
      if (capture === undefined) continue;
      const spec = context.get(token.name);
      if (!spec) continue;
      const value = this.#parseCapture(capture, spec, token);
      if (value.kind === "err") return new Err(value.error);
      const list = candidates.get(token.name) ?? [];
      list.push(value.value);
      candidates.set(token.name, list);
    }

    const resolved = new Map<string, BoundValue>();
    for (const [name, list] of candidates) {
      const merged = mergeCandidates(name, list);
      if (merged.kind === "err") return new Err(merged.error);
      resolved.set(name, merged.value);
    }
    return new Ok(resolved);
  }
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
