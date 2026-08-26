import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import type { Module } from "@/infrastructure/di";
import { Ok, type Result } from "@/infrastructure/result";
import { testContainer } from "@/testing";

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
    .number("index", 7)
    .derived("day_of_month", CalendarDate.fromAnchor(anchor("2022-01-05")), (value) => value.day);
}

export async function installTestEngine(handlers: FunctionHandler[] = []): Promise<TemplateEngine> {
  const handlerModule: Module = {
    register(c) {
      for (const handler of handlers) c.register(FunctionHandlerToken).useValue(handler);
    },
  };
  const harness = await testContainer({ modules: [handlerModule] });
  return harness.resolve(TemplateEngine);
}

export class FakeHandler implements FunctionHandler {
  static fixed(name: string, output: string): FakeHandler {
    return new FakeHandler(name, () => new Ok(output));
  }

  readonly #implementation: (input: FunctionInput) => Result<string, TemplateRenderError>;

  readonly name: string;

  constructor(name: string, implementation: (input: FunctionInput) => Result<string, TemplateRenderError>) {
    this.name = name;
    this.#implementation = implementation;
  }

  render(input: FunctionInput): Result<string, TemplateRenderError> {
    return this.#implementation(input);
  }
}
