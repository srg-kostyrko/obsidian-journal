import type { CalendarDate } from "@/calendar";

export type Unit = "y" | "q" | "m" | "w" | "d" | "h";

export type Modifier =
  | { kind: "shift"; sign: 1 | -1; amount: number; unit: Unit }
  | { kind: "boundary"; direction: "start" | "end"; unit: string };

export type Token =
  | { kind: "literal"; text: string }
  | { kind: "variable"; name: string; modifiers: Modifier[]; format?: string; raw: string }
  | { kind: "function"; name: string; arg: string; modifiers: Modifier[]; format?: string; raw: string };

export type TokenStream = readonly Token[];

export type VariableSpec =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: CalendarDate; defaultFormat: string };

export type BoundValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: CalendarDate };

export type Bindings = ReadonlyMap<string, BoundValue>;

export interface FunctionInput {
  arg: string;
  sourceDate: CalendarDate;
  format?: string;
  ctx: TemplateContext;
  engine: TemplateEngine;
}

export type TemplateContext = unknown;
export type TemplateEngine = unknown;

export interface ValidationProblem {
  token: Token;
  position: number;
  problem:
    | "unknown-variable"
    | "function-not-allowed"
    | "format-on-non-date"
    | "modifiers-on-non-date"
    | "unknown-unit"
    | "unknown-function";
}
