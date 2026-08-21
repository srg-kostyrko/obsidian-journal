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

  // The fallback lets a template token spelled in a different case (e.g. `{{Date}}`) still
  // resolve its variable's binding. Exact match wins first, so two variables differing only in
  // case each keep their own binding — numbering source names are user-authored and unique only
  // case-sensitively (config.ts).
  #lookup(name: string): { name: string; spec: VariableSpec } | undefined {
    const exact = this.#variables.get(name);
    if (exact) return { name, spec: exact };
    const lowered = name.toLowerCase();
    for (const [key, spec] of this.#variables) {
      if (key.toLowerCase() === lowered) return { name: key, spec };
    }
    return undefined;
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

  derived(name: string, value: CalendarDate, compute: (date: CalendarDate) => number): TemplateContext {
    return this.#with(name, { kind: "derived", value, compute });
  }

  clock(name: string, value: Clock, defaultFormat: string): TemplateContext {
    return this.#with(name, { kind: "clock", value, defaultFormat });
  }

  withSpec(name: string, spec: VariableSpec): TemplateContext {
    return this.#with(name, spec);
  }

  get(name: string): VariableSpec | undefined {
    return this.#lookup(name)?.spec;
  }

  // The name a variable was defined under, for a token that may have spelled it in any case.
  // Bindings are keyed by this so a caller reading `bindings.get("date")` finds `{{Date}}`'s value.
  canonicalName(name: string): string | undefined {
    return this.#lookup(name)?.name;
  }

  has(name: string): boolean {
    return this.#lookup(name) !== undefined;
  }
}
