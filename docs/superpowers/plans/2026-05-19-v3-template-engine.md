# v3 Template Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `src/templates/` engine described in `docs/superpowers/specs/2026-05-19-v3-template-engine-design.md` — a parser-driven template engine with full v2 forward-render parity, template-aware reverse parsing, and a multi-token DI extension point for `journal_link`-style function variables.

**Architecture:** Pure tokenizer produces a `Token[]` stream; an immutable `TemplateContext` carries per-call variable values; pure functions in `kinds.ts` handle string/number/date render+parse; function-style tokens dispatch through `FunctionHandlerToken` multi-token DI bindings; `TemplateEngine` orchestrates render (total, v2-pass-through on failure) and parse (Result-returning, template-aware).

**Tech Stack:** TypeScript, `obsidian.moment` (already wrapped by `localMoment`), valibot (none here), vitest, the project's DI (`@/infrastructure/di`) and Result/Option (`@/infrastructure/result`).

---

## File map

**New files in `src/templates/`:**

- `types.ts` — `Token`, `Modifier`, `TokenStream`, `VarSpec`, `Bindings`, `BoundValue`, `FunctionInput`, `ValidationProblem`
- `errors.ts` — `TemplatesError`, `TemplateParseError`, `TemplateRenderError`
- `format-regex.ts` — `formatToRegexp(format): RegExp` (ported from `_old-code/utils/moment.ts`)
- `grammar.ts` — `tokenize(template): TokenStream`
- `modifiers.ts` — `applyModifier`, `unapplyModifier`, `applyModifiers`, `unapplyModifiers`
- `kinds.ts` — render and parse helpers for string/number/date
- `handlers.ts` — `FunctionHandler` interface + `FunctionHandlerToken` multi-token
- `context.ts` — `TemplateContext` class (immutable, fluent)
- `engine.ts` — `TemplateEngine` class (render + parse + validate)
- `module.ts` — `templatesModule` DI binding
- `index.ts` — public barrel
- `testing.ts` — `buildFakeContext()`, `FakeHandler`, `installTestEngine()`

**Modified files:**

- `src/calendar/calendar-date.ts` — add `shift`, `startOf`, `endOf` methods
- `src/calendar/index.ts` — barrel re-exports unchanged (CalendarDate already exported)

**Test files (colocated):**

- `src/calendar/calendar-date.test.ts` — extend with shift/startOf/endOf cases
- `src/templates/format-regex.test.ts`
- `src/templates/grammar.test.ts`
- `src/templates/modifiers.test.ts`
- `src/templates/kinds.test.ts`
- `src/templates/engine.test.ts`

**Out of scope (handled by future specs):**

- `JournalLinkHandler` — belongs to a journal_link spec or the note-creation spec; this plan proves the extension point works via `FakeHandler` in `testing.ts`.
- Settings-UI integration of `engine.validate()` — journal-settings-ui spec.
- Deletion of `src/_old-code/utils/template.ts` — happens when v2 callers are migrated, not here.

---

## Conventions reminders

- npm scripts (not pnpm). Per-task gate: `npm run test`, `npm run check:types`, `npm run check:lint` (per [[feedback_test_commands]]).
- Field initializers: `readonly #x = inject(Token)` at declaration; no constructor body assignments (per [[feedback_field_initializer_preference]]).
- Errors only in `errors.ts` (per [[feedback_errors_in_errors_ts]]).
- `ts-pattern` over `switch` for discriminated unions (per [[feedback_ts_pattern_over_switch]]).
- One behavior per test; nested `describe` for scope; no "and"/colon separators in test names (per [[feedback_one_behavior_per_test]], [[feedback_nested_describes]]).
- Commits per task, no `Co-Authored-By` trailer (per [[feedback_no_coauthored_by]]).

---

### Task 1: Extend `CalendarDate` with `shift`/`startOf`/`endOf`

**Files:**

- Modify: `src/calendar/calendar-date.ts`
- Test: `src/calendar/calendar-date.test.ts`

- [ ] **Step 1: Write failing tests for `shift`**

Append to `src/calendar/calendar-date.test.ts` inside `describe("CalendarDate", () => { ... })`:

```typescript
describe("shift", () => {
  it("adds days", () => {
    const result = CalendarDate.fromAnchor(anchor("2022-01-01")).shift(1, "d");
    expect(result.toAnchor()).toBe("2022-01-02");
  });

  it("subtracts days", () => {
    const result = CalendarDate.fromAnchor(anchor("2022-01-01")).shift(-1, "d");
    expect(result.toAnchor()).toBe("2021-12-31");
  });

  it.each([
    ["w", 1, "2022-01-08"],
    ["w", -1, "2021-12-25"],
    ["m", 1, "2022-02-01"],
    ["m", -1, "2021-12-01"],
    ["q", 1, "2022-04-01"],
    ["q", -1, "2021-10-01"],
    ["y", 1, "2023-01-01"],
    ["y", -1, "2021-01-01"],
  ] as const)("supports %s by %i", (unit, amount, expected) => {
    const result = CalendarDate.fromAnchor(anchor("2022-01-01")).shift(amount, unit);
    expect(result.toAnchor()).toBe(expected);
  });

  it("is a no-op when unit is h", () => {
    const result = CalendarDate.fromAnchor(anchor("2022-01-01")).shift(5, "h");
    expect(result.toAnchor()).toBe("2022-01-01");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/calendar/calendar-date.test.ts`
Expected: FAIL — `result.shift is not a function`.

- [ ] **Step 3: Implement `shift`**

Add to the `CalendarDate` class in `src/calendar/calendar-date.ts`, after `compareTo`:

```typescript
  shift(amount: number, unit: "y" | "q" | "m" | "w" | "d" | "h"): CalendarDate {
    if (unit === "h") return this;
    const moment = localMoment(this.#anchor, ANCHOR_FORMAT, true).add(amount, unit);
    return CalendarDate._fromMoment(moment);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/calendar/calendar-date.test.ts`
Expected: all shift tests PASS.

- [ ] **Step 5: Write failing tests for `startOf` / `endOf`**

Append to `src/calendar/calendar-date.test.ts`:

```typescript
describe("startOf", () => {
  it.each([
    ["week", "2022-01-05", "2022-01-03"],
    ["month", "2022-01-04", "2022-01-01"],
    ["quarter", "2022-01-04", "2022-01-01"],
    ["year", "2022-01-04", "2022-01-01"],
    ["decade", "2022-01-04", "2020-01-01"],
    ["day", "2022-01-04", "2022-01-04"],
  ] as const)("snaps to start of %s", (unit, input, expected) => {
    const result = CalendarDate.fromAnchor(anchor(input)).startOf(unit);
    expect(result.toAnchor()).toBe(expected);
  });
});

describe("endOf", () => {
  it.each([
    ["week", "2022-01-05", "2022-01-09"],
    ["month", "2022-01-04", "2022-01-31"],
    ["quarter", "2022-01-04", "2022-03-31"],
    ["year", "2022-01-04", "2022-12-31"],
    ["decade", "2022-01-04", "2029-12-31"],
    ["day", "2022-01-04", "2022-01-04"],
  ] as const)("snaps to end of %s", (unit, input, expected) => {
    const result = CalendarDate.fromAnchor(anchor(input)).endOf(unit);
    expect(result.toAnchor()).toBe(expected);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test -- src/calendar/calendar-date.test.ts`
Expected: FAIL — `.startOf is not a function`.

- [ ] **Step 7: Implement `startOf` / `endOf`**

Add to the `CalendarDate` class:

```typescript
  startOf(unit: "year" | "quarter" | "month" | "week" | "day" | "decade"): CalendarDate {
    if (unit === "decade") {
      const moment = localMoment(this.#anchor, ANCHOR_FORMAT, true);
      const startYear = moment.year() - (moment.year() % 10);
      return CalendarDate._fromMoment(moment.year(startYear).startOf("year"));
    }
    const moment = localMoment(this.#anchor, ANCHOR_FORMAT, true).startOf(unit);
    return CalendarDate._fromMoment(moment);
  }

  endOf(unit: "year" | "quarter" | "month" | "week" | "day" | "decade"): CalendarDate {
    if (unit === "decade") {
      const moment = localMoment(this.#anchor, ANCHOR_FORMAT, true);
      const endYear = moment.year() + (9 - (moment.year() % 10));
      return CalendarDate._fromMoment(moment.year(endYear).endOf("year"));
    }
    const moment = localMoment(this.#anchor, ANCHOR_FORMAT, true).endOf(unit);
    return CalendarDate._fromMoment(moment);
  }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test -- src/calendar/calendar-date.test.ts`
Expected: all PASS.

- [ ] **Step 9: Run gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/calendar/calendar-date.ts src/calendar/calendar-date.test.ts
git commit -m "feat(calendar): CalendarDate.shift/startOf/endOf for template modifiers"
```

---

### Task 2: Port `formatToRegexp` to `src/templates/format-regex.ts`

**Files:**

- Create: `src/templates/format-regex.ts`
- Create: `src/templates/format-regex.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/templates/format-regex.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";

import { formatToRegexp } from "./format-regex";

describe("formatToRegexp", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("Y / M / D tokens", () => {
    it("compiles YYYY-MM-DD into a regex matching that shape", () => {
      const regex = formatToRegexp("YYYY-MM-DD");
      expect(regex.test("2025-03-14")).toBe(true);
      expect(regex.test("25-3-1")).toBe(false);
    });

    it("compiles YYYY into a 4-digit year matcher", () => {
      const regex = formatToRegexp("YYYY");
      expect(regex.test("2025")).toBe(true);
      expect(regex.test("25")).toBe(false);
    });
  });

  describe("week tokens", () => {
    it("compiles YYYY-[W]w into a regex matching ISO week notation", () => {
      const regex = formatToRegexp("YYYY-[W]w");
      expect(regex.test("2025-W3")).toBe(true);
      expect(regex.test("2025-W42")).toBe(true);
    });
  });

  describe("literal escape brackets", () => {
    it("treats text inside square brackets as literal", () => {
      const regex = formatToRegexp("[journal-]YYYY");
      expect(regex.test("journal-2025")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/templates/format-regex.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `format-regex.ts`**

Create `src/templates/format-regex.ts`:

```typescript
import { moment } from "obsidian";

const localeData = moment.localeData();

const formatRegExpParts = new Map<string, string>([
  ["M", "([1-9]|1[0-2])"],
  ["MM", "(0[1-9]|1[0-2])"],
  ["MMM", "(" + localeData.monthsShort().join("|") + ")"],
  ["MMMM", "(" + localeData.months().join("|") + ")"],
  ["Q", "[1-4]"],
  ["D", "[0-9]{1,2}"],
  ["DD", "[0-9]{2}"],
  ["DDD", "[1-9]{1,3}"],
  ["DDDD", "[1-9]{3}"],
  ["d", "[0-6]"],
  ["dd", "(" + localeData.weekdaysMin().join("|") + ")"],
  ["ddd", "(" + localeData.weekdaysShort().join("|") + ")"],
  ["dddd", "(" + localeData.weekdays().join("|") + ")"],
  ["w", "[0-9]{1,2}"],
  ["ww", "[0-9]{2}"],
  ["W", "[0-9]{1,2}"],
  ["WW", "[0-9]{2}"],
  ["YY", "[0-9]{2}"],
  ["YYYY", "[0-9]{4}"],
]);

const supportedSymbols = new Set(["M", "Q", "D", "d", "w", "W", "Y"]);

export function formatToRegexp(format: string): RegExp {
  const parts: string[] = [];

  let lastChar = "";
  let lastCharCount = 0;
  let exact = false;
  let exactText = "";

  const flushSymbol = () => {
    if (lastCharCount > 0) {
      const prepared = formatRegExpParts.get(lastChar.repeat(lastCharCount));
      if (prepared) parts.push(prepared);
      lastCharCount = 0;
      lastChar = "";
    }
  };

  for (const char of format) {
    if (exact) {
      if (char === "]") {
        parts.push(escapeRegexLiteral(exactText));
        exact = false;
        exactText = "";
      } else {
        exactText += char;
      }
      continue;
    }
    if (char === "[") {
      flushSymbol();
      exact = true;
      continue;
    }
    if (supportedSymbols.has(char)) {
      if (lastChar === char) {
        lastCharCount++;
      } else {
        flushSymbol();
        lastCharCount = 1;
        lastChar = char;
      }
    } else {
      flushSymbol();
      parts.push(escapeRegexLiteral(char));
    }
  }
  flushSymbol();
  return new RegExp(parts.join(""));
}

function escapeRegexLiteral(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/templates/format-regex.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run gates**

Run: `npm run test && npm run check:types && npm run check:lint`

- [ ] **Step 6: Commit**

```bash
git add src/templates/format-regex.ts src/templates/format-regex.test.ts
git commit -m "feat(templates): port formatToRegexp for date-format pattern matching"
```

---

### Task 3: Types and Errors

**Files:**

- Create: `src/templates/types.ts`
- Create: `src/templates/errors.ts`

No tests in this task — pure type/class declarations consumed by later tasks. Per [[feedback_no_wiring_tests]], we don't test trivial type/error shape.

- [ ] **Step 1: Create `types.ts`**

```typescript
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

export type VarSpec =
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
  ctx: import("./context").TemplateContext;
  engine: import("./engine").TemplateEngine;
}

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
```

The `raw` field on variable/function tokens stores the original `{{...}}` text so render can pass it through verbatim on lookup failure (v2 fidelity).

- [ ] **Step 2: Create `errors.ts`**

```typescript
import type { BoundValue } from "./types";

export class TemplatesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export type TemplateParseErrorDetail =
  | { kind: "no-match"; input: string }
  | { kind: "invalid-number"; capture: string; varName: string }
  | { kind: "invalid-date"; capture: string; varName: string; format: string }
  | { kind: "conflict"; varName: string; candidates: BoundValue[] }
  | { kind: "not-invertible"; reason: "function-token" | "unknown-variable"; offending: string };

export class TemplateParseError extends TemplatesError {
  constructor(readonly detail: TemplateParseErrorDetail) {
    super(formatParseError(detail));
  }
}

export class TemplateRenderError extends TemplatesError {
  constructor(
    readonly reason: string,
    readonly cause?: unknown,
  ) {
    super(reason);
  }
}

function formatParseError(detail: TemplateParseErrorDetail): string {
  switch (detail.kind) {
    case "no-match":
      return `Template did not match input: ${detail.input}`;
    case "invalid-number":
      return `Variable ${detail.varName}: cannot parse "${detail.capture}" as number`;
    case "invalid-date":
      return `Variable ${detail.varName}: cannot parse "${detail.capture}" with format "${detail.format}"`;
    case "conflict":
      return `Variable ${detail.varName}: conflicting captures`;
    case "not-invertible":
      return `Template is not invertible (${detail.reason}: ${detail.offending})`;
  }
}
```

- [ ] **Step 3: Run gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS (test gate not applicable — no tests).

- [ ] **Step 4: Commit**

```bash
git add src/templates/types.ts src/templates/errors.ts
git commit -m "feat(templates): token/modifier/varSpec types and error classes"
```

---

### Task 4: Grammar — `tokenize`

**Files:**

- Create: `src/templates/grammar.ts`
- Create: `src/templates/grammar.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/templates/grammar.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { tokenize } from "./grammar";

describe("tokenize", () => {
  describe("literals", () => {
    it("returns a single literal token for plain text", () => {
      expect(tokenize("hello world")).toEqual([{ kind: "literal", text: "hello world" }]);
    });

    it("returns empty stream for empty template", () => {
      expect(tokenize("")).toEqual([]);
    });
  });

  describe("variable tokens", () => {
    it("parses a bare variable", () => {
      expect(tokenize("{{date}}")).toEqual([
        { kind: "variable", name: "date", modifiers: [], format: undefined, raw: "{{date}}" },
      ]);
    });

    it("allows whitespace around the name", () => {
      const tokens = tokenize("{{ date }}");
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({ kind: "variable", name: "date" });
    });

    it("parses a format slot", () => {
      const tokens = tokenize("{{date:YYYY-MM-DD}}");
      expect(tokens[0]).toMatchObject({ kind: "variable", name: "date", format: "YYYY-MM-DD" });
    });

    it("parses arithmetic modifier", () => {
      const tokens = tokenize("{{date+1w}}");
      expect(tokens[0]).toMatchObject({
        kind: "variable",
        name: "date",
        modifiers: [{ kind: "shift", sign: 1, amount: 1, unit: "w" }],
      });
    });

    it("parses negative arithmetic modifier", () => {
      const tokens = tokenize("{{date-2d}}");
      expect(tokens[0]).toMatchObject({
        modifiers: [{ kind: "shift", sign: -1, amount: 2, unit: "d" }],
      });
    });

    it("parses boundary modifier", () => {
      const tokens = tokenize("{{date<startOf=week>}}");
      expect(tokens[0]).toMatchObject({
        modifiers: [{ kind: "boundary", direction: "start", unit: "week" }],
      });
    });

    it("parses combined arithmetic + boundary + format", () => {
      const tokens = tokenize("{{date+1w<endOf=month>:YYYY-MM-DD}}");
      expect(tokens[0]).toMatchObject({
        kind: "variable",
        name: "date",
        modifiers: [
          { kind: "shift", sign: 1, amount: 1, unit: "w" },
          { kind: "boundary", direction: "end", unit: "month" },
        ],
        format: "YYYY-MM-DD",
      });
    });

    it("preserves colons inside the format slot", () => {
      const tokens = tokenize("{{time:HH:mm:ss}}");
      expect(tokens[0]).toMatchObject({ format: "HH:mm:ss" });
    });
  });

  describe("function tokens", () => {
    it("parses a function with single argument", () => {
      const tokens = tokenize("{{journal_link(Daily)}}");
      expect(tokens[0]).toMatchObject({ kind: "function", name: "journal_link", arg: "Daily" });
    });

    it("trims whitespace inside parens", () => {
      const tokens = tokenize("{{journal_link( My Journal )}}");
      expect(tokens[0]).toMatchObject({ arg: "My Journal" });
    });

    it("supports modifiers on function tokens", () => {
      const tokens = tokenize("{{journal_link(Weekly)+1w:YYYY}}");
      expect(tokens[0]).toMatchObject({
        kind: "function",
        name: "journal_link",
        arg: "Weekly",
        modifiers: [{ kind: "shift", sign: 1, amount: 1, unit: "w" }],
        format: "YYYY",
      });
    });
  });

  describe("mixed templates", () => {
    it("interleaves literals and variables", () => {
      const tokens = tokenize("prefix-{{date}}-suffix");
      expect(tokens).toEqual([
        { kind: "literal", text: "prefix-" },
        { kind: "variable", name: "date", modifiers: [], format: undefined, raw: "{{date}}" },
        { kind: "literal", text: "-suffix" },
      ]);
    });
  });

  describe("malformed tokens (v2 fidelity)", () => {
    it("treats an unclosed brace block as a literal up to end of input", () => {
      const tokens = tokenize("hello {{date");
      expect(tokens).toEqual([{ kind: "literal", text: "hello {{date" }]);
    });

    it("treats a brace block with illegal characters as a literal", () => {
      const tokens = tokenize("{{!!!}}");
      expect(tokens).toEqual([{ kind: "literal", text: "{{!!!}}" }]);
    });

    it("treats a brace block with unparsable modifier as a literal", () => {
      const tokens = tokenize("{{date+xx}}");
      expect(tokens).toEqual([{ kind: "literal", text: "{{date+xx}}" }]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/templates/grammar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `grammar.ts`**

Create `src/templates/grammar.ts`:

```typescript
import type { Modifier, Token, TokenStream, Unit } from "./types";

const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MODIFIER_RE = /^([+-])(\d+)([yqmwdh])$/;
const BOUNDARY_RE = /^<(startOf|endOf)=([a-zA-Z]+)>$/;
const KNOWN_UNITS: ReadonlySet<Unit> = new Set(["y", "q", "m", "w", "d", "h"]);

export function tokenize(template: string): TokenStream {
  const tokens: Token[] = [];
  let i = 0;
  let literalStart = 0;

  while (i < template.length) {
    if (template[i] === "{" && template[i + 1] === "{") {
      const close = template.indexOf("}}", i + 2);
      if (close === -1) break; // unclosed → fall through to literal at end
      const inner = template.slice(i + 2, close);
      const parsed = parseTokenInner(inner, template.slice(i, close + 2));
      if (parsed) {
        if (literalStart < i) {
          tokens.push({ kind: "literal", text: template.slice(literalStart, i) });
        }
        tokens.push(parsed);
        i = close + 2;
        literalStart = i;
        continue;
      }
      // malformed → emit `{{...}}` as part of the surrounding literal
      i = close + 2;
      continue;
    }
    i++;
  }

  if (literalStart < template.length) {
    tokens.push({ kind: "literal", text: template.slice(literalStart) });
  }
  return tokens;
}

function parseTokenInner(inner: string, raw: string): Token | undefined {
  let rest = inner.trim();
  // name
  const nameMatch = rest.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (!nameMatch) return undefined;
  const name = nameMatch[1];
  rest = rest.slice(name.length);

  // optional (arg)
  let arg: string | undefined;
  if (rest.startsWith("(")) {
    const closeParen = rest.indexOf(")");
    if (closeParen === -1) return undefined;
    arg = rest.slice(1, closeParen).trim();
    rest = rest.slice(closeParen + 1);
  }
  rest = rest.trimStart();

  // optional modifiers (any order; we walk eagerly)
  const modifiers: Modifier[] = [];
  while (rest.length > 0 && rest[0] !== ":" && rest[0] !== "}") {
    const arithMatch = rest.match(/^([+-]\d+[a-z])/);
    const boundaryMatch = rest.match(/^(<[a-zA-Z]+=[a-zA-Z]+>)/);
    if (arithMatch) {
      const m = arithMatch[1].match(MODIFIER_RE);
      if (!m) return undefined;
      const unit = m[3] as Unit;
      if (!KNOWN_UNITS.has(unit)) return undefined;
      modifiers.push({ kind: "shift", sign: m[1] === "+" ? 1 : -1, amount: Number.parseInt(m[2], 10), unit });
      rest = rest.slice(arithMatch[1].length).trimStart();
    } else if (boundaryMatch) {
      const m = boundaryMatch[1].match(BOUNDARY_RE);
      if (!m) return undefined;
      modifiers.push({ kind: "boundary", direction: m[1] === "startOf" ? "start" : "end", unit: m[2] });
      rest = rest.slice(boundaryMatch[1].length).trimStart();
    } else {
      return undefined; // unparsable junk
    }
  }

  // optional :format
  let format: string | undefined;
  if (rest.startsWith(":")) {
    format = rest.slice(1);
    rest = "";
  }
  if (rest.trim().length > 0) return undefined;

  if (!NAME_RE.test(name)) return undefined;

  if (arg !== undefined) {
    return { kind: "function", name, arg, modifiers, format, raw };
  }
  return { kind: "variable", name, modifiers, format, raw };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/templates/grammar.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run gates**

Run: `npm run test && npm run check:types && npm run check:lint`

- [ ] **Step 6: Commit**

```bash
git add src/templates/grammar.ts src/templates/grammar.test.ts
git commit -m "feat(templates): tokenize variable/function/literal grammar"
```

---

### Task 5: Modifiers

**Files:**

- Create: `src/templates/modifiers.ts`
- Create: `src/templates/modifiers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/templates/modifiers.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";

import { applyModifiers, unapplyModifiers } from "./modifiers";

import type { Modifier } from "./types";

describe("applyModifiers / unapplyModifiers", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("apply", () => {
    it("applies a +1d shift", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-01"));
      const result = applyModifiers(date, [{ kind: "shift", sign: 1, amount: 1, unit: "d" }]);
      expect(result.toAnchor()).toBe("2022-01-02");
    });

    it("applies arithmetic before boundary in v2 order", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-01"));
      const mods: Modifier[] = [
        { kind: "shift", sign: 1, amount: 1, unit: "w" },
        { kind: "boundary", direction: "start", unit: "month" },
      ];
      const result = applyModifiers(date, mods);
      expect(result.toAnchor()).toBe("2022-01-01"); // +1w → 2022-01-08, then startOf month → 2022-01-01
    });
  });

  describe("unapply", () => {
    it("inverts a +1d shift", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-02"));
      const result = unapplyModifiers(date, [{ kind: "shift", sign: 1, amount: 1, unit: "d" }]);
      expect(result.toAnchor()).toBe("2022-01-01");
    });

    it("is identity on boundary modifiers", () => {
      const date = CalendarDate.fromAnchor(anchor("2022-01-03"));
      const result = unapplyModifiers(date, [{ kind: "boundary", direction: "start", unit: "week" }]);
      expect(result.toAnchor()).toBe("2022-01-03");
    });

    it.each([
      [{ kind: "shift", sign: 1, amount: 3, unit: "d" } as const, "2022-01-01"],
      [{ kind: "shift", sign: -1, amount: 2, unit: "w" } as const, "2022-01-01"],
      [{ kind: "shift", sign: 1, amount: 1, unit: "m" } as const, "2022-01-01"],
      [{ kind: "shift", sign: 1, amount: 1, unit: "q" } as const, "2022-01-01"],
      [{ kind: "shift", sign: 1, amount: 1, unit: "y" } as const, "2022-01-01"],
    ])("round-trips %j", (mod, source) => {
      const start = CalendarDate.fromAnchor(anchor(source));
      const after = applyModifiers(start, [mod]);
      const back = unapplyModifiers(after, [mod]);
      expect(back.toAnchor()).toBe(source);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/templates/modifiers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `modifiers.ts`**

Create `src/templates/modifiers.ts`:

```typescript
import { match } from "ts-pattern";

import type { CalendarDate } from "@/calendar";

import type { Modifier } from "./types";

const BOUNDARY_UNITS = new Set(["year", "quarter", "month", "week", "day", "decade"]);

export function applyModifier(date: CalendarDate, m: Modifier): CalendarDate {
  return match(m)
    .with({ kind: "shift" }, ({ sign, amount, unit }) => date.shift(sign * amount, unit))
    .with({ kind: "boundary" }, ({ direction, unit }) => {
      if (!BOUNDARY_UNITS.has(unit)) return date;
      const u = unit as "year" | "quarter" | "month" | "week" | "day" | "decade";
      return direction === "start" ? date.startOf(u) : date.endOf(u);
    })
    .exhaustive();
}

export function unapplyModifier(date: CalendarDate, m: Modifier): CalendarDate {
  return match(m)
    .with({ kind: "shift" }, ({ sign, amount, unit }) => date.shift(-1 * sign * amount, unit))
    .with({ kind: "boundary" }, () => date)
    .exhaustive();
}

export function applyModifiers(date: CalendarDate, ms: readonly Modifier[]): CalendarDate {
  // v2 order: arithmetic shifts first, then boundary
  const shifts = ms.filter((m): m is Extract<Modifier, { kind: "shift" }> => m.kind === "shift");
  const boundaries = ms.filter((m): m is Extract<Modifier, { kind: "boundary" }> => m.kind === "boundary");
  let result = date;
  for (const m of shifts) result = applyModifier(result, m);
  for (const m of boundaries) result = applyModifier(result, m);
  return result;
}

export function unapplyModifiers(date: CalendarDate, ms: readonly Modifier[]): CalendarDate {
  // reverse order: undo boundaries first (no-op), then undo shifts
  const shifts = ms.filter((m): m is Extract<Modifier, { kind: "shift" }> => m.kind === "shift");
  let result = date;
  for (let i = shifts.length - 1; i >= 0; i--) {
    result = unapplyModifier(result, shifts[i]);
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/templates/modifiers.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run gates**

Run: `npm run test && npm run check:types && npm run check:lint`

- [ ] **Step 6: Commit**

```bash
git add src/templates/modifiers.ts src/templates/modifiers.test.ts
git commit -m "feat(templates): apply/unapply date modifiers with v2 ordering"
```

---

### Task 6: TemplateContext

**Files:**

- Create: `src/templates/context.ts`

No tests in this task — `TemplateContext` is a thin immutable map. Per [[feedback_no_wiring_tests]] / [[feedback_no_trivial_tests]] its behavior is covered transitively by engine tests.

- [ ] **Step 1: Create `context.ts`**

```typescript
import type { CalendarDate } from "@/calendar";

import type { VarSpec } from "./types";

export class TemplateContext {
  readonly #vars: ReadonlyMap<string, VarSpec>;

  private constructor(vars: ReadonlyMap<string, VarSpec>) {
    this.#vars = vars;
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

  get(name: string): VarSpec | undefined {
    return this.#vars.get(name);
  }

  has(name: string): boolean {
    return this.#vars.has(name);
  }

  #with(name: string, spec: VarSpec): TemplateContext {
    const next = new Map(this.#vars);
    next.set(name, spec);
    return new TemplateContext(next);
  }
}
```

- [ ] **Step 2: Run gates**

Run: `npm run check:types && npm run check:lint`

- [ ] **Step 3: Commit**

```bash
git add src/templates/context.ts
git commit -m "feat(templates): immutable TemplateContext value type"
```

---

### Task 7: Kinds — render & parse helpers

**Files:**

- Create: `src/templates/kinds.ts`
- Create: `src/templates/kinds.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/templates/kinds.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { parseDate, parseNumber, parseString, patternForKind, renderDate, renderNumber, renderString } from "./kinds";

import type { Modifier, VarSpec } from "./types";

describe("kinds", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("renderString", () => {
    it("emits the value verbatim", () => {
      expect(renderString({ kind: "string", value: "hello" })).toBe("hello");
    });
  });

  describe("renderNumber", () => {
    it("formats with toString", () => {
      expect(renderNumber({ kind: "number", value: 42 })).toBe("42");
    });
  });

  describe("renderDate", () => {
    it("uses defaultFormat when no override given", () => {
      const spec: VarSpec = {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2022-01-01")),
        defaultFormat: "YYYY-MM-DD",
      };
      expect(renderDate(spec, [])).toBe("2022-01-01");
    });

    it("respects format override", () => {
      const spec: VarSpec = {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2022-01-01")),
        defaultFormat: "YYYY-MM-DD",
      };
      expect(renderDate(spec, [], "MMM D, YYYY")).toBe("Jan 1, 2022");
    });

    it("applies modifiers before formatting", () => {
      const spec: VarSpec = {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2022-01-01")),
        defaultFormat: "YYYY-MM-DD",
      };
      const mods: Modifier[] = [{ kind: "shift", sign: 1, amount: 1, unit: "w" }];
      expect(renderDate(spec, mods)).toBe("2022-01-08");
    });
  });

  describe("patternForKind", () => {
    it("returns non-greedy any-match for string", () => {
      expect(patternForKind({ kind: "string", value: "" })).toBe(".+?");
    });

    it("returns signed-integer pattern for number", () => {
      expect(patternForKind({ kind: "number", value: 0 })).toBe("-?\\d+");
    });

    it("returns format-derived pattern for date", () => {
      const spec: VarSpec = {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2022-01-01")),
        defaultFormat: "YYYY-MM-DD",
      };
      const pattern = patternForKind(spec);
      expect(new RegExp(`^${pattern}$`).test("2022-01-01")).toBe(true);
    });
  });

  describe("parseString / parseNumber / parseDate", () => {
    it("parses a string capture", () => {
      expect(parseString("hello", "x")).toEqual({ kind: "ok", value: "hello" });
    });

    it("parses a valid number", () => {
      const result = parseNumber("42", "n");
      expectOk(result);
      expect(result.value).toBe(42);
    });

    it("returns Err for invalid number", () => {
      const result = parseNumber("foo", "n");
      expectErr(result);
      expect(result.error.detail.kind).toBe("invalid-number");
    });

    it("parses a date capture", () => {
      const result = parseDate("2022-01-05", "YYYY-MM-DD", [], "d");
      expectOk(result);
      expect(result.value.toAnchor()).toBe("2022-01-05");
    });

    it("un-applies modifiers on the parsed date", () => {
      const result = parseDate("2022-01-08", "YYYY-MM-DD", [{ kind: "shift", sign: 1, amount: 1, unit: "w" }], "d");
      expectOk(result);
      expect(result.value.toAnchor()).toBe("2022-01-01");
    });

    it("returns Err for date capture moment cannot parse strictly", () => {
      const result = parseDate("not-a-date", "YYYY-MM-DD", [], "d");
      expectErr(result);
      expect(result.error.detail.kind).toBe("invalid-date");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/templates/kinds.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `kinds.ts`**

Create `src/templates/kinds.ts`:

```typescript
import { CalendarDate } from "@/calendar";
import { Err, Ok, type Result } from "@/infrastructure/result";

import { TemplateParseError } from "./errors";
import { formatToRegexp } from "./format-regex";
import { applyModifiers, unapplyModifiers } from "./modifiers";

import type { Modifier, VarSpec } from "./types";

export function renderString(spec: Extract<VarSpec, { kind: "string" }>): string {
  return spec.value;
}

export function renderNumber(spec: Extract<VarSpec, { kind: "number" }>): string {
  return spec.value.toString();
}

export function renderDate(
  spec: Extract<VarSpec, { kind: "date" }>,
  modifiers: readonly Modifier[],
  format?: string,
): string {
  const shifted = applyModifiers(spec.value, modifiers);
  return shifted.format(format ?? spec.defaultFormat);
}

export function patternForKind(spec: VarSpec, format?: string): string {
  switch (spec.kind) {
    case "string":
      return ".+?";
    case "number":
      return "-?\\d+";
    case "date": {
      const effective = format ?? spec.defaultFormat;
      return formatToRegexp(effective).source;
    }
  }
}

export function parseString(capture: string, _varName: string): Result<string, TemplateParseError> {
  return new Ok(capture);
}

export function parseNumber(capture: string, varName: string): Result<number, TemplateParseError> {
  const n = Number.parseInt(capture, 10);
  if (Number.isNaN(n)) {
    return new Err(new TemplateParseError({ kind: "invalid-number", capture, varName }));
  }
  return new Ok(n);
}

export function parseDate(
  capture: string,
  format: string,
  modifiers: readonly Modifier[],
  varName: string,
): Result<CalendarDate, TemplateParseError> {
  const parsed = CalendarDate.parse(capture, format);
  if (parsed.kind === "err") {
    return new Err(new TemplateParseError({ kind: "invalid-date", capture, varName, format }));
  }
  return new Ok(unapplyModifiers(parsed.value, modifiers));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/templates/kinds.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run gates**

Run: `npm run test && npm run check:types && npm run check:lint`

- [ ] **Step 6: Commit**

```bash
git add src/templates/kinds.ts src/templates/kinds.test.ts
git commit -m "feat(templates): kind-keyed render + parse helpers"
```

---

### Task 8: FunctionHandler interface + multi-token

**Files:**

- Create: `src/templates/handlers.ts`

No tests — declarations only.

- [ ] **Step 1: Create `handlers.ts`**

```typescript
import { createMultiToken } from "@/infrastructure/di";
import type { Result } from "@/infrastructure/result";

import type { TemplateRenderError } from "./errors";
import type { FunctionInput } from "./types";

export interface FunctionHandler {
  readonly name: string;
  render(input: FunctionInput): Result<string, TemplateRenderError>;
}

export const FunctionHandlerToken = createMultiToken<FunctionHandler>("templates.FunctionHandler");
```

- [ ] **Step 2: Run gates**

Run: `npm run check:types && npm run check:lint`

- [ ] **Step 3: Commit**

```bash
git add src/templates/handlers.ts
git commit -m "feat(templates): FunctionHandler interface + DI multi-token"
```

---

### Task 9: Engine — `renderString` / `renderStream`

**Files:**

- Create: `src/templates/engine.ts`
- Create: `src/templates/engine.test.ts`
- Create: `src/templates/testing.ts`

- [ ] **Step 1: Create test helpers in `testing.ts`**

```typescript
import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { Ok, type Result } from "@/infrastructure/result";

import { TemplateContext } from "./context";
import { TemplateEngine } from "./engine";
import { FunctionHandlerToken, type FunctionHandler } from "./handlers";

import type { TemplateRenderError } from "./errors";
import type { FunctionInput } from "./types";

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
  for (const h of handlers) {
    container.register(FunctionHandlerToken).useValue(h);
  }
  container.register(TemplateEngine).useClass(TemplateEngine);
  return container.resolve(TemplateEngine);
}

export class FakeHandler implements FunctionHandler {
  readonly name: string;
  readonly #impl: (input: FunctionInput) => Result<string, TemplateRenderError>;

  constructor(name: string, impl: (input: FunctionInput) => Result<string, TemplateRenderError>) {
    this.name = name;
    this.#impl = impl;
  }

  render(input: FunctionInput): Result<string, TemplateRenderError> {
    return this.#impl(input);
  }

  static fixed(name: string, output: string): FakeHandler {
    return new FakeHandler(name, () => new Ok(output));
  }
}
```

- [ ] **Step 2: Write failing render tests**

Create `src/templates/engine.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";

import { TemplateContext } from "./context";
import { buildFakeContext, FakeHandler, installTestEngine } from "./testing";

describe("TemplateEngine.renderString", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("renders literal-only templates unchanged", () => {
    const engine = installTestEngine();
    expect(engine.renderString("just literal", buildFakeContext())).toBe("just literal");
  });

  it("renders a string variable", () => {
    const engine = installTestEngine();
    expect(engine.renderString("Journal: {{journal_name}}", buildFakeContext())).toBe("Journal: Daily");
  });

  it("renders a number variable", () => {
    const engine = installTestEngine();
    expect(engine.renderString("Sprint {{index}}", buildFakeContext())).toBe("Sprint 7");
  });

  it("renders a date variable with default format", () => {
    const engine = installTestEngine();
    expect(engine.renderString("Today: {{date}}", buildFakeContext())).toBe("Today: 2022-01-05");
  });

  it("renders a date variable with format override", () => {
    const engine = installTestEngine();
    expect(engine.renderString("Today: {{date:MMM D, YYYY}}", buildFakeContext())).toBe("Today: Jan 5, 2022");
  });

  it.each([
    ["{{date+1d}}", "2022-01-06"],
    ["{{date-1d}}", "2022-01-04"],
    ["{{date+1w}}", "2022-01-12"],
    ["{{date+1m}}", "2022-02-05"],
    ["{{date+1q}}", "2022-04-05"],
    ["{{date+1y}}", "2023-01-05"],
  ])("renders %s with arithmetic", (template, expected) => {
    const engine = installTestEngine();
    expect(engine.renderString(template, buildFakeContext())).toBe(expected);
  });

  it.each([
    ["{{date<startOf=week>}}", "2022-01-03"],
    ["{{date<endOf=week>}}", "2022-01-09"],
    ["{{date<startOf=month>}}", "2022-01-01"],
    ["{{date<endOf=month>}}", "2022-01-31"],
    ["{{date<startOf=quarter>}}", "2022-01-01"],
    ["{{date<endOf=quarter>}}", "2022-03-31"],
    ["{{date<startOf=decade>}}", "2020-01-01"],
    ["{{date<endOf=decade>}}", "2029-12-31"],
  ])("renders %s with boundary modifier", (template, expected) => {
    const engine = installTestEngine();
    expect(engine.renderString(template, buildFakeContext())).toBe(expected);
  });

  describe("v2 pass-through fidelity", () => {
    it("passes through unknown variable name verbatim", () => {
      const engine = installTestEngine();
      expect(engine.renderString("hello {{not_a_var}}", buildFakeContext())).toBe("hello {{not_a_var}}");
    });

    it("passes through function token when no handler registered", () => {
      const engine = installTestEngine();
      expect(engine.renderString("link: {{journal_link(Other)}}", buildFakeContext())).toBe(
        "link: {{journal_link(Other)}}",
      );
    });

    it("ignores format slot on string variables", () => {
      const engine = installTestEngine();
      expect(engine.renderString("{{journal_name:YYYY}}", buildFakeContext())).toBe("{{journal_name:YYYY}}");
    });
  });

  describe("function dispatch", () => {
    it("invokes a registered handler", () => {
      const engine = installTestEngine([FakeHandler.fixed("greet", "hi")]);
      expect(engine.renderString("{{greet(world)}}", buildFakeContext())).toBe("hi");
    });

    it("passes the modifier-shifted source date to handler", () => {
      const handler = new FakeHandler("show_date", (input) => ({ kind: "ok", value: input.sourceDate.toAnchor() }));
      const engine = installTestEngine([handler]);
      expect(engine.renderString("{{show_date(x)+1w}}", buildFakeContext())).toBe("2022-01-12");
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- src/templates/engine.test.ts`
Expected: FAIL — `TemplateEngine` not found.

- [ ] **Step 4: Implement `engine.ts` (render only)**

Create `src/templates/engine.ts`:

```typescript
import { match } from "ts-pattern";

import { CalendarDate, Clock } from "@/calendar";
import { inject } from "@/infrastructure/di";

import { TemplateContext } from "./context";
import { tokenize } from "./grammar";
import { FunctionHandlerToken, type FunctionHandler } from "./handlers";
import { renderDate, renderNumber, renderString } from "./kinds";
import { applyModifiers } from "./modifiers";

import type { Token, TokenStream } from "./types";

export class TemplateEngine {
  readonly #clock = inject(Clock);
  readonly #handlersByName: ReadonlyMap<string, FunctionHandler>;

  constructor() {
    const handlers = inject(FunctionHandlerToken);
    this.#handlersByName = new Map(handlers.map((h) => [h.name, h]));
  }

  renderString(template: string, ctx: TemplateContext): string {
    return this.renderStream(tokenize(template), ctx);
  }

  renderStream(stream: TokenStream, ctx: TemplateContext): string {
    let output = "";
    for (const token of stream) {
      output += this.#renderToken(token, ctx);
    }
    return output;
  }

  #renderToken(token: Token, ctx: TemplateContext): string {
    return match(token)
      .with({ kind: "literal" }, (t) => t.text)
      .with({ kind: "variable" }, (t) => this.#renderVariable(t, ctx))
      .with({ kind: "function" }, (t) => this.#renderFunction(t, ctx))
      .exhaustive();
  }

  #renderVariable(token: Extract<Token, { kind: "variable" }>, ctx: TemplateContext): string {
    const spec = ctx.get(token.name);
    if (!spec) return token.raw;
    return match(spec)
      .with({ kind: "string" }, (s) => renderString(s))
      .with({ kind: "number" }, (s) => renderNumber(s))
      .with({ kind: "date" }, (s) => renderDate(s, token.modifiers, token.format))
      .exhaustive();
  }

  #renderFunction(token: Extract<Token, { kind: "function" }>, ctx: TemplateContext): string {
    const handler = this.#handlersByName.get(token.name);
    if (!handler) return token.raw;
    const sourceDate = this.#sourceDateFor(ctx);
    const shifted = applyModifiers(sourceDate, token.modifiers);
    const result = handler.render({
      arg: token.arg,
      sourceDate: shifted,
      format: token.format,
      ctx,
      engine: this,
    });
    if (result.kind === "err") return token.raw;
    return result.value;
  }

  #sourceDateFor(ctx: TemplateContext): CalendarDate {
    const spec = ctx.get("date");
    if (spec && spec.kind === "date") return spec.value;
    void this.#clock; // reserved for future per-call clock injection
    return CalendarDate.today();
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/templates/engine.test.ts`
Expected: all PASS.

- [ ] **Step 6: Run gates**

Run: `npm run test && npm run check:types && npm run check:lint`

- [ ] **Step 7: Commit**

```bash
git add src/templates/engine.ts src/templates/engine.test.ts src/templates/testing.ts
git commit -m "feat(templates): TemplateEngine render with kinds + function dispatch"
```

---

### Task 10: Engine — `parse` (reverse)

**Files:**

- Modify: `src/templates/engine.ts`
- Modify: `src/templates/engine.test.ts`

- [ ] **Step 1: Write failing parse tests**

Append to `src/templates/engine.test.ts`:

```typescript
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { tokenize } from "./grammar";

describe("TemplateEngine.parse", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("parses a single date variable from a path", () => {
    const engine = installTestEngine();
    const ctx = buildFakeContext();
    const result = engine.parse(tokenize("{{date:YYYY-MM-DD}}.md"), "2022-01-05.md", ctx);
    expectOk(result);
    const bound = result.value.get("date");
    expect(bound).toBeDefined();
    expect(bound!.kind).toBe("date");
    if (bound!.kind === "date") {
      expect(bound!.value.toAnchor()).toBe("2022-01-05");
    }
  });

  it("un-applies modifiers during parse", () => {
    const engine = installTestEngine();
    const ctx = buildFakeContext();
    const result = engine.parse(tokenize("{{date+1w:YYYY-MM-DD}}.md"), "2022-01-12.md", ctx);
    expectOk(result);
    const bound = result.value.get("date");
    if (bound?.kind === "date") {
      expect(bound.value.toAnchor()).toBe("2022-01-05");
    } else {
      throw new Error("expected date binding");
    }
  });

  it("parses index and date from a multi-variable name", () => {
    const engine = installTestEngine();
    const ctx = buildFakeContext();
    const stream = tokenize("Sprint {{index}} - {{date:YYYY-MM-DD}}.md");
    const result = engine.parse(stream, "Sprint 7 - 2022-01-05.md", ctx);
    expectOk(result);
    expect(result.value.get("index")).toEqual({ kind: "number", value: 7 });
    const dateBound = result.value.get("date");
    if (dateBound?.kind === "date") {
      expect(dateBound.value.toAnchor()).toBe("2022-01-05");
    } else {
      throw new Error("expected date binding");
    }
  });

  it("treats current_date as a wildcard (no capture)", () => {
    const engine = installTestEngine();
    const ctx = buildFakeContext().date("current_date", CalendarDate.fromAnchor(anchor("2022-01-05")), "YYYY-MM-DD");
    const stream = tokenize("{{date:YYYY-MM-DD}}-{{current_date:YYYY-MM-DD}}.md");
    const result = engine.parse(stream, "2022-01-05-anything-here.md", ctx);
    expectOk(result);
    expect(result.value.has("current_date")).toBe(false);
  });

  it("returns no-match when literal text does not match", () => {
    const engine = installTestEngine();
    const result = engine.parse(tokenize("prefix-{{date:YYYY-MM-DD}}.md"), "other-2022-01-05.md", buildFakeContext());
    expectErr(result);
    expect(result.error.detail.kind).toBe("no-match");
  });

  it("returns invalid-date when capture cannot be parsed strictly", () => {
    const engine = installTestEngine();
    const ctx = buildFakeContext();
    const result = engine.parse(tokenize("{{date:YYYY-MM-DD}}.md"), "9999-99-99.md", ctx);
    expectErr(result);
    expect(["invalid-date", "no-match"]).toContain(result.error.detail.kind);
  });

  it("returns not-invertible for templates containing function tokens", () => {
    const engine = installTestEngine([FakeHandler.fixed("greet", "x")]);
    const result = engine.parse(tokenize("{{greet(arg)}}.md"), "x.md", buildFakeContext());
    expectErr(result);
    expect(result.error.detail.kind).toBe("not-invertible");
  });

  it("returns not-invertible for unknown variables", () => {
    const engine = installTestEngine();
    const ctx = TemplateContext.empty(); // no `date` defined
    const result = engine.parse(tokenize("{{date:YYYY-MM-DD}}.md"), "2022-01-05.md", ctx);
    expectErr(result);
    expect(result.error.detail.kind).toBe("not-invertible");
  });

  describe("multi-binding resolution", () => {
    it("resolves consistent boundary captures to start-of-range source", () => {
      const engine = installTestEngine();
      const ctx = buildFakeContext();
      const stream = tokenize("{{date<startOf=week>:YYYY-MM-DD}}-{{date<endOf=week>:YYYY-MM-DD}}.md");
      const result = engine.parse(stream, "2022-01-03-2022-01-09.md", ctx);
      expectOk(result);
      const bound = result.value.get("date");
      if (bound?.kind === "date") {
        expect(bound.value.toAnchor()).toBe("2022-01-03");
      } else {
        throw new Error("expected date binding");
      }
    });

    it("returns conflict for inconsistent captures of same variable", () => {
      const engine = installTestEngine();
      const ctx = buildFakeContext();
      const stream = tokenize("{{date:YYYY-MM-DD}}-{{date:YYYY-MM-DD}}.md");
      const result = engine.parse(stream, "2022-01-05-2022-02-10.md", ctx);
      expectErr(result);
      expect(result.error.detail.kind).toBe("conflict");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/templates/engine.test.ts`
Expected: FAIL — `engine.parse is not a function`.

- [ ] **Step 3: Extend `engine.ts` with parse**

Add imports at the top of `src/templates/engine.ts`:

```typescript
import { Err, Ok, type Result } from "@/infrastructure/result";

import { TemplateParseError } from "./errors";
import { parseDate, parseNumber, parseString, patternForKind } from "./kinds";
import { applyModifiers } from "./modifiers";

import type { Bindings, BoundValue, Modifier, VarSpec } from "./types";
```

Add to the class body:

```typescript
  parse(stream: TokenStream, input: string, ctx: TemplateContext): Result<Bindings, TemplateParseError> {
    const compiled = this.#compileMatcher(stream, ctx);
    if (compiled.kind === "err") return compiled;
    const { regex, captureTokens } = compiled.value;
    const match = regex.exec(input);
    if (!match || !match.groups) {
      return new Err(new TemplateParseError({ kind: "no-match", input }));
    }

    const candidates = new Map<string, BoundValue[]>();
    for (const [i, token] of captureTokens.entries()) {
      const capture = match.groups[`v_${i}`];
      if (capture === undefined) continue;
      const spec = ctx.get(token.name);
      if (!spec) continue; // already gated in compile
      const value = this.#parseCapture(capture, spec, token, ctx);
      if (value.kind === "err") return value;
      const list = candidates.get(token.name) ?? [];
      list.push(value.value);
      candidates.set(token.name, list);
    }

    const resolved = new Map<string, BoundValue>();
    for (const [name, list] of candidates) {
      const merged = mergeCandidates(name, list);
      if (merged.kind === "err") return merged;
      resolved.set(name, merged.value);
    }
    return new Ok(resolved);
  }

  #compileMatcher(
    stream: TokenStream,
    ctx: TemplateContext,
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
      const spec = ctx.get(token.name);
      if (!spec) {
        return new Err(
          new TemplateParseError({ kind: "not-invertible", reason: "unknown-variable", offending: token.name }),
        );
      }
      const idx = captureTokens.length;
      const pattern = patternForKind(spec, token.format);
      parts.push(`(?<v_${idx}>${pattern})`);
      captureTokens.push(token);
    }
    parts.push("$");
    return new Ok({ regex: new RegExp(parts.join("")), captureTokens });
  }

  #parseCapture(
    capture: string,
    spec: VarSpec,
    token: Extract<Token, { kind: "variable" }>,
    _ctx: TemplateContext,
  ): Result<BoundValue, TemplateParseError> {
    switch (spec.kind) {
      case "string": {
        const r = parseString(capture, token.name);
        return r.kind === "ok" ? new Ok({ kind: "string", value: r.value }) : r;
      }
      case "number": {
        const r = parseNumber(capture, token.name);
        return r.kind === "ok" ? new Ok({ kind: "number", value: r.value }) : r;
      }
      case "date": {
        const fmt = token.format ?? spec.defaultFormat;
        const r = parseDate(capture, fmt, token.modifiers, token.name);
        return r.kind === "ok" ? new Ok({ kind: "date", value: r.value }) : r;
      }
    }
  }
```

Add module-level helpers at the bottom:

```typescript
function escapeRegex(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeCandidates(name: string, candidates: BoundValue[]): Result<BoundValue, TemplateParseError> {
  if (candidates.length === 1) return new Ok(candidates[0]);
  const first = candidates[0];

  if (first.kind === "string" || first.kind === "number") {
    for (const c of candidates) {
      if (c.kind !== first.kind || c.value !== (first as { value: unknown }).value) {
        return new Err(new TemplateParseError({ kind: "conflict", varName: name, candidates }));
      }
    }
    return new Ok(first);
  }

  // dates: pick the latest (max) candidate — start of the consistent range
  let chosen = first;
  for (const c of candidates) {
    if (c.kind !== "date") {
      return new Err(new TemplateParseError({ kind: "conflict", varName: name, candidates }));
    }
    if (c.value.isAfter(chosen.value)) chosen = c;
  }
  // verify all candidates lie at-or-before the chosen value (a coarse consistency check;
  // tighter interval-consistency lives in a future revision)
  for (const c of candidates) {
    if (c.kind !== "date") continue;
    if (c.value.isAfter(chosen.value)) {
      return new Err(new TemplateParseError({ kind: "conflict", varName: name, candidates }));
    }
  }
  return new Ok(chosen);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/templates/engine.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run gates**

Run: `npm run test && npm run check:types && npm run check:lint`

- [ ] **Step 6: Commit**

```bash
git add src/templates/engine.ts src/templates/engine.test.ts
git commit -m "feat(templates): reverse parse with multi-binding resolution"
```

---

### Task 11: Engine — `validate` walker

**Files:**

- Modify: `src/templates/engine.ts`
- Modify: `src/templates/engine.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/templates/engine.test.ts`:

```typescript
describe("TemplateEngine.validate", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("returns empty problems for valid template", () => {
    const engine = installTestEngine();
    const stream = tokenize("{{date:YYYY-MM-DD}}.md");
    expect(engine.validate(stream, buildFakeContext())).toEqual([]);
  });

  it("flags unknown variable", () => {
    const engine = installTestEngine();
    const stream = tokenize("{{not_a_var}}.md");
    const problems = engine.validate(stream, buildFakeContext());
    expect(problems).toHaveLength(1);
    expect(problems[0].problem).toBe("unknown-variable");
  });

  it("flags function token when allowFunctions is false", () => {
    const engine = installTestEngine([FakeHandler.fixed("greet", "x")]);
    const stream = tokenize("{{greet(x)}}.md");
    const problems = engine.validate(stream, buildFakeContext(), { allowFunctions: false });
    expect(problems[0].problem).toBe("function-not-allowed");
  });

  it("flags unknown function when handler missing", () => {
    const engine = installTestEngine();
    const stream = tokenize("{{nope(x)}}.md");
    const problems = engine.validate(stream, buildFakeContext(), { allowFunctions: true });
    expect(problems[0].problem).toBe("unknown-function");
  });

  it("flags format on non-date variable", () => {
    const engine = installTestEngine();
    const stream = tokenize("{{journal_name:YYYY}}");
    const problems = engine.validate(stream, buildFakeContext());
    expect(problems.some((p) => p.problem === "format-on-non-date")).toBe(true);
  });

  it("flags modifiers on non-date variable", () => {
    const engine = installTestEngine();
    const stream = tokenize("{{index+1d}}");
    const problems = engine.validate(stream, buildFakeContext());
    expect(problems.some((p) => p.problem === "modifiers-on-non-date")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/templates/engine.test.ts`
Expected: FAIL — `engine.validate is not a function`.

- [ ] **Step 3: Implement `validate`**

Add the import to `src/templates/engine.ts`:

```typescript
import type { ValidationProblem } from "./types";
```

Add to the class body:

```typescript
  validate(
    stream: TokenStream,
    ctx: TemplateContext,
    opts: { allowFunctions?: boolean } = {},
  ): ValidationProblem[] {
    const allowFunctions = opts.allowFunctions ?? false;
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
        } else if (!this.#handlersByName.has(token.name)) {
          problems.push({ token, position, problem: "unknown-function" });
        }
        position += token.raw.length;
        continue;
      }
      const spec = ctx.get(token.name);
      if (!spec) {
        problems.push({ token, position, problem: "unknown-variable" });
        position += token.raw.length;
        continue;
      }
      if (spec.kind !== "date") {
        if (token.format !== undefined) {
          problems.push({ token, position, problem: "format-on-non-date" });
        }
        if (token.modifiers.length > 0) {
          problems.push({ token, position, problem: "modifiers-on-non-date" });
        }
      }
      position += token.raw.length;
    }
    return problems;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/templates/engine.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run gates**

Run: `npm run test && npm run check:types && npm run check:lint`

- [ ] **Step 6: Commit**

```bash
git add src/templates/engine.ts src/templates/engine.test.ts
git commit -m "feat(templates): validate walker for settings UI"
```

---

### Task 12: DI module, barrel, and wire into main

**Files:**

- Create: `src/templates/module.ts`
- Create: `src/templates/index.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `module.ts`**

```typescript
import type { Module } from "@/infrastructure/di";

import { TemplateEngine } from "./engine";

export const templatesModule: Module = {
  register(c) {
    c.register(TemplateEngine).useClass(TemplateEngine);
  },
};
```

- [ ] **Step 2: Create `index.ts` (public barrel)**

Per [[feedback_barrel_files]], main barrel exports public API only. Test helpers stay in `testing.ts` (separate barrel via direct path imports).

```typescript
export { TemplateEngine } from "./engine";
export { TemplateContext } from "./context";
export { tokenize } from "./grammar";
export { FunctionHandlerToken, type FunctionHandler } from "./handlers";
export { templatesModule } from "./module";

export { TemplatesError, TemplateParseError, TemplateRenderError, type TemplateParseErrorDetail } from "./errors";

export type {
  Token,
  TokenStream,
  Modifier,
  VarSpec,
  Bindings,
  BoundValue,
  FunctionInput,
  ValidationProblem,
} from "./types";
```

- [ ] **Step 3: Wire into `main.ts`**

Modify `src/main.ts` — add the import and `addModule` call:

```typescript
import { templatesModule } from "@/templates";
```

Add after `container.addModule(CalendarModule);`:

```typescript
container.addModule(templatesModule);
```

- [ ] **Step 4: Run gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all PASS, including the engine tests against the integrated module.

- [ ] **Step 5: Commit**

```bash
git add src/templates/module.ts src/templates/index.ts src/main.ts
git commit -m "feat(templates): templatesModule registration + barrel"
```

---

### Task 13: Final review and integration smoke test

**Files:**

- Modify: `src/templates/engine.test.ts` (add v2-parity table)

- [ ] **Step 1: Add a v2-parity integration block**

Append to `src/templates/engine.test.ts`:

```typescript
describe("v2 parity", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("renders v2's full daily-note example", () => {
    const engine = installTestEngine();
    const ctx = buildFakeContext();
    expect(engine.renderString("{{date}}", ctx)).toBe("2022-01-05");
    expect(engine.renderString("{{date:MMM D, YYYY}}", ctx)).toBe("Jan 5, 2022");
    expect(engine.renderString("Sprint {{index}} — {{date:YYYY-MM-DD}}", ctx)).toBe("Sprint 7 — 2022-01-05");
  });

  it("renders v2's weekly path example", () => {
    const engine = installTestEngine();
    const ctx = TemplateContext.empty()
      .date("date", CalendarDate.fromAnchor(anchor("2022-01-05")), "YYYY-[W]w")
      .date("start_date", CalendarDate.fromAnchor(anchor("2022-01-03")), "YYYY-MM-DD")
      .date("end_date", CalendarDate.fromAnchor(anchor("2022-01-09")), "YYYY-MM-DD")
      .string("journal_name", "Weekly")
      .number("index", 1);
    expect(engine.renderString("{{date}}", ctx)).toBe("2022-W1");
  });
});
```

- [ ] **Step 2: Run full gates**

Run: `npm run test && npm run check:types && npm run check:lint`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/templates/engine.test.ts
git commit -m "test(templates): v2 parity scenarios"
```

---

## Out-of-band notes for the executor

- **Do not delete `src/_old-code/utils/template.ts`** as part of this plan. It's still referenced by `src/_old-code/journals/journal.ts` and other v2-era code that hasn't been migrated; deletion happens when v2 callers move to the new engine in the note-creation spec.
- **Do not implement `JournalLinkHandler`** in this plan. The engine's extension point is proved via `FakeHandler` in `testing.ts`. The real handler ships with the note-creation / journal_link spec.
- **If `installTestCalendar()` is missing in any test**, the test imports it from `@/calendar/testing` — copy from `src/journals/numbering.test.ts:18` for the canonical setup.
- **If `expectOk`/`expectErr` narrowing isn't enough** to convince TypeScript about discriminated unions in tests, fall back to explicit `if (x.kind === "ok") ...` per [[feedback_no_vitest_wrappers]].
