import type { CalendarDate } from "@/calendar";

import type { VariableSpec } from "./types";

export class TemplateContext {
  readonly #variables: ReadonlyMap<string, VariableSpec>;

  private constructor(variables: ReadonlyMap<string, VariableSpec>) {
    this.#variables = variables;
  }

  static empty(): TemplateContext {
    return new TemplateContext(new Map());
  }

  string(name: string, value: string): TemplateContext {
    return this.#with(name, { kind: "string", value });
  }

  number(name: string, value: number): TemplateContext {
    return this.#with(name, { kind: "number", value });
  }

  date(name: string, value: CalendarDate, defaultFormat: string): TemplateContext {
    return this.#with(name, { kind: "date", value, defaultFormat });
  }

  get(name: string): VariableSpec | undefined {
    return this.#variables.get(name);
  }

  has(name: string): boolean {
    return this.#variables.has(name);
  }

  #with(name: string, spec: VariableSpec): TemplateContext {
    const next = new Map(this.#variables);
    next.set(name, spec);
    return new TemplateContext(next);
  }
}
