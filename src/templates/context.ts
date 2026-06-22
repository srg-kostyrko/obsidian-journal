import type { CalendarDate, Clock } from "@/calendar";

import type { VariableSpec } from "./types";

export class TemplateContext {
  static empty(): TemplateContext {
    return new TemplateContext(new Map());
  }

  readonly #variables: ReadonlyMap<string, VariableSpec>;

  private constructor(variables: ReadonlyMap<string, VariableSpec>) {
    this.#variables = variables;
  }

  #with(name: string, spec: VariableSpec): TemplateContext {
    const next = new Map(this.#variables);
    next.set(name, spec);
    return new TemplateContext(next);
  }

  string(name: string, value: string): TemplateContext {
    return this.#with(name, { kind: "string", value });
  }

  number(name: string, value: number): TemplateContext {
    return this.#with(name, { kind: "number", value });
  }

  date(name: string, value: CalendarDate, defaultFormat: string, options?: { invertible?: boolean }): TemplateContext {
    return this.#with(name, {
      kind: "date",
      value,
      defaultFormat,
      ...(options?.invertible === false && { invertible: false }),
    });
  }

  clock(name: string, value: Clock, defaultFormat: string): TemplateContext {
    return this.#with(name, { kind: "clock", value, defaultFormat });
  }

  withSpec(name: string, spec: VariableSpec): TemplateContext {
    return this.#with(name, spec);
  }

  get(name: string): VariableSpec | undefined {
    return this.#variables.get(name);
  }

  has(name: string): boolean {
    return this.#variables.has(name);
  }
}
