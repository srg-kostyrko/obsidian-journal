import type { CalendarDate, Clock } from "@/calendar";

export type Unit = "y" | "q" | "m" | "w" | "d" | "h";

export type Modifier =
  | { kind: "shift"; sign: 1 | -1; amount: number; unit: Unit }
  | { kind: "boundary"; direction: "start" | "end"; unit: string }
  | { kind: "offset"; sign: 1 | -1; amount: number };

export type Token =
  | { kind: "literal"; text: string }
  | { kind: "variable"; name: string; modifiers: Modifier[]; format?: string; raw: string }
  | { kind: "function"; name: string; arg: string; modifiers: Modifier[]; format?: string; raw: string };

export type TokenStream = readonly Token[];

export type VariableSpec =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: CalendarDate; defaultFormat: string; invertible?: boolean }
  | { kind: "clock"; value: Clock; defaultFormat: string };

export type BoundValue =
  { kind: "string"; value: string } | { kind: "number"; value: number } | { kind: "date"; value: CalendarDate };

export type Bindings = ReadonlyMap<string, BoundValue>;

export interface ValidationProblem {
  token: Token;
  position: number;
  problem:
    | "unknown-variable"
    | "function-not-allowed"
    | "format-on-non-date"
    | "modifiers-on-non-date"
    | "unsupported-number-format"
    | "offset-on-date"
    | "unknown-unit"
    | "unknown-function";
}
