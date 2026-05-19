import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { Ok, type Result } from "@/infrastructure/result";

import { TemplateContext } from "./context";
import { TemplateEngine } from "./engine";
import { FunctionHandlerToken, type FunctionHandler, type FunctionInput } from "./handlers";

import type { TemplateRenderError } from "./errors";

export function buildFakeContext(): TemplateContext {
  return TemplateContext.empty()
    .date("date", CalendarDate.fromAnchor(anchor("2022-01-05")), "YYYY-MM-DD")
    .date("start_date", CalendarDate.fromAnchor(anchor("2022-01-03")), "YYYY-MM-DD")
    .date("end_date", CalendarDate.fromAnchor(anchor("2022-01-09")), "YYYY-MM-DD")
    .string("journal_name", "Daily")
    .number("index", 7);
}

export function installTestEngine(handlers: FunctionHandler[] = []): TemplateEngine {
  const container = new Container();
  for (const handler of handlers) {
    container.register(FunctionHandlerToken).useValue(handler);
  }
  container.register(TemplateEngine).useClass(TemplateEngine);
  return container.resolve(TemplateEngine);
}

export class FakeHandler implements FunctionHandler {
  readonly name: string;
  readonly #implementation: (input: FunctionInput) => Result<string, TemplateRenderError>;

  constructor(name: string, implementation: (input: FunctionInput) => Result<string, TemplateRenderError>) {
    this.name = name;
    this.#implementation = implementation;
  }

  render(input: FunctionInput): Result<string, TemplateRenderError> {
    return this.#implementation(input);
  }

  static fixed(name: string, output: string): FakeHandler {
    return new FakeHandler(name, () => new Ok(output));
  }
}
