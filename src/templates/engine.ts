import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Err, Ok, type Result } from "@/infrastructure/result";

import { TemplateParseError } from "./errors";
import { tokenize } from "./grammar";
import { FunctionHandlerToken, type FunctionHandler } from "./handlers";
import { parseDate, parseNumber, parseString, patternForKind, renderDate, renderNumber, renderString } from "./kinds";
import { applyModifiers } from "./modifiers";

import type { TemplateContext } from "./context";
import type { Bindings, BoundValue, Token, TokenStream, VariableSpec } from "./types";

export class TemplateEngine {
  readonly #handlersByName: ReadonlyMap<string, FunctionHandler>;

  constructor() {
    const handlers = inject(FunctionHandlerToken);
    this.#handlersByName = new Map(handlers.map((h) => [h.name, h]));
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
    // v2 fidelity: modifiers and :format are only meaningful on date kind.
    // For string/number variables with either present, emit the raw token unchanged.
    if (spec.kind !== "date" && (token.modifiers.length > 0 || token.format !== undefined)) {
      return token.raw;
    }
    return match(spec)
      .with({ kind: "string" }, (s) => renderString(s))
      .with({ kind: "number" }, (s) => renderNumber(s))
      .with({ kind: "date" }, (s) => renderDate(s, token.modifiers, token.format))
      .exhaustive();
  }

  #renderFunction(token: Extract<Token, { kind: "function" }>, context: TemplateContext): string {
    const handler = this.#handlersByName.get(token.name);
    if (!handler) return token.raw;
    const sourceDate = this.#sourceDateFor(context);
    const shifted = applyModifiers(sourceDate, token.modifiers);
    const result = handler.render({
      arg: token.arg,
      sourceDate: shifted,
      format: token.format,
      ctx: context,
      engine: this,
    });
    if (result.kind === "err") return token.raw;
    return result.value;
  }

  #sourceDateFor(context: TemplateContext): CalendarDate {
    const spec = context.get("date");
    return spec?.kind === "date" ? spec.value : CalendarDate.today();
  }

  parse(stream: TokenStream, input: string, context: TemplateContext): Result<Bindings, TemplateParseError> {
    const compiled = this.#compileMatcher(stream, context);
    if (compiled.kind === "err") return new Err(compiled.error);
    const { regex, captureTokens } = compiled.value;
    const matched = regex.exec(input);
    if (!matched?.groups) {
      return new Err(new TemplateParseError({ kind: "no-match", input }));
    }

    const candidates = new Map<string, BoundValue[]>();
    for (const [index, token] of captureTokens.entries()) {
      const capture = matched.groups[`v_${index}`];
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

  #compileMatcher(
    stream: TokenStream,
    context: TemplateContext,
  ): Result<{ regex: RegExp; captureTokens: Extract<Token, { kind: "variable" }>[] }, TemplateParseError> {
    const parts: string[] = ["^"];
    const captureTokens: Extract<Token, { kind: "variable" }>[] = [];
    const wildcardNames = new Set(["current_date", "current_time", "time"]);

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
      if (wildcardNames.has(token.name)) {
        parts.push(".+?");
        continue;
      }
      const spec = context.get(token.name);
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
    switch (spec.kind) {
      case "string": {
        const result = parseString(capture, token.name);
        return result.kind === "ok" ? new Ok({ kind: "string", value: result.value }) : new Err(result.error);
      }
      case "number": {
        const result = parseNumber(capture, token.name);
        return result.kind === "ok" ? new Ok({ kind: "number", value: result.value }) : new Err(result.error);
      }
      case "date": {
        const format = token.format ?? spec.defaultFormat;
        const result = parseDate(capture, format, token.modifiers, token.name);
        if (result.kind === "err") return new Err(result.error);
        // Normalize to "lower bound of source range" so multi-binding resolution
        // can compare candidates by value equality. A bare `<endOf=unit>` modifier
        // makes parsed value the upper bound of the source's range; bring it back
        // to the range start. Bare `<startOf=unit>` already IS the lower bound.
        // Arithmetic-shift modifiers were already unapplied by parseDate; what
        // remains is unmodified or boundary-only.
        let lowerBound = result.value;
        for (const modifier of token.modifiers) {
          if (modifier.kind === "boundary" && modifier.direction === "end" && BOUNDARY_UNITS.has(modifier.unit)) {
            lowerBound = lowerBound.startOf(modifier.unit as "year" | "quarter" | "month" | "week" | "day" | "decade");
          }
        }
        return new Ok({ kind: "date", value: lowerBound });
      }
    }
  }
}

const BOUNDARY_UNITS = new Set(["year", "quarter", "month", "week", "day", "decade"]);

function escapeRegex(source: string): string {
  return source.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function mergeCandidates(name: string, candidates: BoundValue[]): Result<BoundValue, TemplateParseError> {
  if (candidates.length === 1) return new Ok(candidates[0]);
  const first = candidates[0];

  if (first.kind === "string" || first.kind === "number") {
    for (const candidate of candidates) {
      if (candidate.kind !== first.kind || candidate.value !== (first as { value: unknown }).value) {
        return new Err(new TemplateParseError({ kind: "conflict", varName: name, candidates }));
      }
    }
    return new Ok(first);
  }

  // dates: every candidate has been normalized to "lower bound of source range"
  // in #parseCapture. All candidates must agree on that lower bound.
  const firstAnchor = first.value.toAnchor();
  for (const candidate of candidates) {
    if (candidate.kind !== "date" || candidate.value.toAnchor() !== firstAnchor) {
      return new Err(new TemplateParseError({ kind: "conflict", varName: name, candidates }));
    }
  }
  return new Ok(first);
}
