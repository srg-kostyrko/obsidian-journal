import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";

import { tokenize } from "./grammar";
import { FunctionHandlerToken, type FunctionHandler } from "./handlers";
import { renderDate, renderNumber, renderString } from "./kinds";
import { applyModifiers } from "./modifiers";

import type { TemplateContext } from "./context";
import type { Token, TokenStream } from "./types";

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
}
