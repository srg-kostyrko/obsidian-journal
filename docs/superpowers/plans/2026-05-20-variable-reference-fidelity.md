# Variable Reference Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore v2-level template-variable surface (`note_name`, `title`, `current_date`, `time`, `current_time`) and date-modification documentation in v3's variable-reference modal, with engine support for a new `clock` variable kind.

**Architecture:** Bottom-up. Extend the `Clock` calendar primitive with shift/boundary methods, add a `clock` variant to the engine's `VariableSpec` discriminated union, generalize modifier application over a `Shiftable` interface, split `NotePathService` into path-context vs body-context builders, then rebuild the modal as context-aware with a click-to-copy chip component and a separate date-modifications sub-modal.

**Tech Stack:** TypeScript, Vue 3 (Composition API + SFC), `@vueuse/core` (clipboard), Vitest + `@testing-library/vue` + `user-event`, ts-pattern, paraglide-js (`messages/en.json`), Obsidian plugin host (`infrastructure/host/modals`).

**Spec:** [`docs/superpowers/specs/2026-05-20-variable-reference-fidelity-design.md`](../specs/2026-05-20-variable-reference-fidelity-design.md)

---

## File Map

**New files:**

- `src/journals/settings/ui/VariableChip.vue` — click-to-copy chip, used by both modals
- `src/journals/settings/ui/VariableChip.test.ts`
- `src/journals/settings/ui/DateModificationsModal.vue` — the date-modifications sub-modal
- `src/journals/settings/ui/DateModificationsModal.test.ts`
- `src/journals/settings/ui/date-modifications-modal.ts` — modal definition
- `src/journals/settings/ui/variable-context.ts` — shared `VariableModalContext` type

**Modified files:**

- `src/calendar/clock.ts` — add `shift`/`startOf`/`endOf`
- `src/calendar/clock.test.ts` — extend
- `src/templates/types.ts` — add `clock` kind + `invertible?` on `date`
- `src/templates/context.ts` — add `clock(name, value, defaultFormat)` builder
- `src/templates/modifiers.ts` — generalize over `Shiftable<U, B>`
- `src/templates/modifiers.test.ts` — extend with Clock cases
- `src/templates/kinds.ts` — add `renderClock`
- `src/templates/kinds.test.ts` — extend
- `src/templates/engine.ts` — clock arm in `#renderVariable`, validate clock, spec-driven wildcard
- `src/templates/engine.test.ts` — extend
- `src/journals/notes/note-path.ts` — extend `contextFor`, add `bodyContextFor`, mark `current_date` as `invertible: false`
- `src/journals/notes/note-path.test.ts` — extend
- `src/journals/notes/template-content.ts` — `renderFor(name, metadata, noteName)`
- `src/journals/notes/template-content.test.ts` — extend
- `src/journals/notes/note-creation.ts` — pass `basename(path)` to `renderFor`
- `src/journals/notes/note-creation.test.ts` — extend
- `src/journals/settings/ui/VariableReferenceModal.vue` — rewrite as context-aware
- `src/journals/settings/ui/variable-reference-modal.ts` — modal-def prop shape change
- `src/journals/settings/ui/VariableReferenceHint.vue` — new prop shape
- `src/journals/settings/ui/VariableReferenceHint.test.ts` — extend
- `src/journals/settings/ui/JournalEditSubpage.vue` — pass per-context props
- `messages/en.json` — new i18n keys (added per-component task, not in one bulk task)

---

## Task 1: Extend Clock with shift/startOf/endOf

**Files:**

- Modify: `src/calendar/clock.ts`
- Modify: `src/calendar/clock.test.ts`

- [ ] **Step 1: Write failing tests for shift**

Append to `src/calendar/clock.test.ts`:

```ts
describe("shift", () => {
  it("adds hours", () => {
    vi.setSystemTime(new Date("2026-05-20T10:00:00"));
    expect(Clock.now().shift(2, "h").format("HH:mm")).toBe("12:00");
  });

  it("subtracts hours via negative amount", () => {
    vi.setSystemTime(new Date("2026-05-20T10:00:00"));
    expect(Clock.now().shift(-3, "h").format("HH:mm")).toBe("07:00");
  });

  it("adds days, weeks, months, quarters, years", () => {
    vi.setSystemTime(new Date("2026-05-20T10:30:00"));
    expect(Clock.now().shift(1, "d").format("YYYY-MM-DD HH:mm")).toBe("2026-05-21 10:30");
    expect(Clock.now().shift(1, "w").format("YYYY-MM-DD")).toBe("2026-05-27");
    expect(Clock.now().shift(1, "m").format("YYYY-MM-DD")).toBe("2026-06-20");
    expect(Clock.now().shift(1, "q").format("YYYY-MM-DD")).toBe("2026-08-20");
    expect(Clock.now().shift(1, "y").format("YYYY-MM-DD")).toBe("2027-05-20");
  });
});

describe("startOf", () => {
  it("rounds down to hour", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    expect(Clock.now().startOf("hour").format("HH:mm:ss")).toBe("10:00:00");
  });

  it("rounds down to day, week, month, quarter, year", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    expect(Clock.now().startOf("day").format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-20 00:00:00");
    expect(Clock.now().startOf("month").format("YYYY-MM-DD")).toBe("2026-05-01");
    expect(Clock.now().startOf("year").format("YYYY-MM-DD")).toBe("2026-01-01");
  });
});

describe("endOf", () => {
  it("rounds up to end of hour", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    expect(Clock.now().endOf("hour").format("HH:mm:ss")).toBe("10:59:59");
  });

  it("rounds up to end of day", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    expect(Clock.now().endOf("day").format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-20 23:59:59");
  });
});

describe("shifts and boundaries stack", () => {
  it("applies shift then boundary in caller order", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    expect(Clock.now().shift(1, "d").startOf("day").format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-21 00:00:00");
  });
});
```

Make sure `vi` and `vi.setSystemTime` imports / `beforeEach(() => vi.useFakeTimers())` are present in the file. (Check existing test setup.)

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm run test -- --run src/calendar/clock.test.ts
```

Expected: failures on `shift is not a function`, `startOf is not a function`, `endOf is not a function`.

- [ ] **Step 3: Implement the new Clock methods**

Replace `src/calendar/clock.ts` with:

```ts
import { localMoment } from "./calendar";

type ShiftUnit = "y" | "q" | "m" | "w" | "d" | "h";
type BoundaryUnit = "year" | "quarter" | "month" | "week" | "day" | "hour";

const SHIFT_UNIT_MAP = { y: "y", q: "Q", m: "M", w: "w", d: "d", h: "h" } as const;

export class Clock {
  readonly kind = "Clock" as const;
  readonly #moment: ReturnType<typeof localMoment>;

  private constructor(m: ReturnType<typeof localMoment>) {
    this.#moment = m;
  }

  static now(): Clock {
    return new Clock(localMoment());
  }

  static msUntilNextLocalMidnight(): number {
    const now = localMoment();
    const nextMidnight = now.clone().startOf("day").add(1, "day");
    return nextMidnight.diff(now);
  }

  format(pattern: string): string {
    return this.#moment.format(pattern);
  }

  shift(amount: number, unit: ShiftUnit): Clock {
    return new Clock(this.#moment.clone().add(amount, SHIFT_UNIT_MAP[unit]));
  }

  startOf(unit: BoundaryUnit): Clock {
    return new Clock(this.#moment.clone().startOf(unit));
  }

  endOf(unit: BoundaryUnit): Clock {
    return new Clock(this.#moment.clone().endOf(unit));
  }
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

```bash
npm run test -- --run src/calendar/clock.test.ts
npm run check:types
npm run check:lint
```

All three must pass.

- [ ] **Step 5: Commit**

```bash
git add src/calendar/clock.ts src/calendar/clock.test.ts
git commit -m "feat(calendar/clock): add shift/startOf/endOf modifier methods"
```

---

## Task 2: Add `clock` kind to engine types + context builder

**Files:**

- Modify: `src/templates/types.ts`
- Modify: `src/templates/context.ts`

- [ ] **Step 1: Extend the discriminated union**

Replace the relevant block in `src/templates/types.ts`:

```ts
import type { CalendarDate, Clock } from "@/calendar";

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
  | { kind: "date"; value: CalendarDate; defaultFormat: string; invertible?: boolean }
  | { kind: "clock"; value: Clock; defaultFormat: string };

export type BoundValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: CalendarDate };

export type Bindings = ReadonlyMap<string, BoundValue>;

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

Also ensure `Clock` is exported from `@/calendar` — check `src/calendar/index.ts`. If not exported, add `export { Clock } from "./clock";` to that index.

- [ ] **Step 2: Add the context builder method**

Edit `src/templates/context.ts`:

```ts
import type { CalendarDate, Clock } from "@/calendar";

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

  date(name: string, value: CalendarDate, defaultFormat: string, options?: { invertible?: boolean }): TemplateContext {
    return this.#with(name, {
      kind: "date",
      value,
      defaultFormat,
      ...(options?.invertible === false ? { invertible: false } : {}),
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

  #with(name: string, spec: VariableSpec): TemplateContext {
    const next = new Map(this.#variables);
    next.set(name, spec);
    return new TemplateContext(next);
  }
}
```

The new `withSpec` is needed in later tasks to register two aliased context entries pointing at the same spec object (for `time`/`current_time` and `note_name`/`title`).

- [ ] **Step 3: Typecheck**

```bash
npm run check:types
```

Existing engine/kinds code must still compile. The new fourth `clock` variant will surface non-exhaustive `match` errors in `engine.ts` and possibly in `kinds.ts`. Note them; they're addressed by Tasks 5–6. For now, expected: compile failure at `engine.ts:.exhaustive()` and possibly `kinds.ts` switch. Skip the commit for now — combine with Task 5–6.

Actually, to keep the tree green: add a temporary clock arm in `engine.ts:#renderVariable` and `engine.ts:validate` and `kinds.ts:patternForKind`. Add minimal arms:

In `src/templates/engine.ts#renderVariable` (line 52 area), inside the `match(spec)`:

```ts
.with({ kind: "clock" }, () => token.raw) // TODO Task 6: render via Clock.format
```

In `src/templates/engine.ts:validate` (line 108 area), change `if (spec.kind !== "date")` to:

```ts
if (spec.kind !== "date" && spec.kind !== "clock") {
```

In `src/templates/kinds.ts:patternForKind` switch:

```ts
case "clock": {
  return ".+?";
}
```

These minimal arms keep the tree green; they get replaced with the real logic in Tasks 5–6.

- [ ] **Step 4: Run full tests + typecheck + lint**

```bash
npm run test -- --run
npm run check:types
npm run check:lint
```

All must pass. No new tests yet (this task is structural).

- [ ] **Step 5: Commit**

```bash
git add src/templates/types.ts src/templates/context.ts src/templates/engine.ts src/templates/kinds.ts src/calendar/index.ts
git commit -m "feat(templates/types): add clock VariableSpec and date invertible flag"
```

---

## Task 3: Generalize modifiers over Shiftable interface

**Files:**

- Modify: `src/templates/modifiers.ts`
- Modify: `src/templates/modifiers.test.ts`

- [ ] **Step 1: Write failing test for Clock instantiation**

Append to `src/templates/modifiers.test.ts`:

```ts
import { Clock } from "@/calendar";

describe("applyModifiers on Clock", () => {
  it("applies shifts then boundaries to a Clock", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const clock = Clock.now();
    const result = applyModifiers(clock, [
      { kind: "shift", sign: 1, amount: 1, unit: "d" },
      { kind: "boundary", direction: "start", unit: "day" },
    ]);
    expect(result.format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-21 00:00:00");
  });

  it("silently ignores unknown boundary units on Clock", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const clock = Clock.now();
    const result = applyModifiers(clock, [{ kind: "boundary", direction: "start", unit: "decade" }]);
    expect(result.format("YYYY-MM-DD HH:mm:ss")).toBe("2026-05-20 10:37:42");
  });
});
```

(Make sure `vi.useFakeTimers()` setup is present at file top, mirroring clock.test.ts.)

- [ ] **Step 2: Run tests, verify failure**

```bash
npm run test -- --run src/templates/modifiers.test.ts
```

Expected: compile failure (`applyModifiers` typed to `CalendarDate`).

- [ ] **Step 3: Generalize `applyModifier`/`applyModifiers`**

Replace `src/templates/modifiers.ts`:

```ts
import { match } from "ts-pattern";

import type { CalendarDate } from "@/calendar";

import type { Modifier, Unit } from "./types";

export type BoundaryUnit = "year" | "quarter" | "month" | "week" | "day" | "decade" | "hour";

export const BOUNDARY_UNITS = new Set<BoundaryUnit>(["year", "quarter", "month", "week", "day", "decade", "hour"]);

export function isBoundaryUnit(unit: string): unit is BoundaryUnit {
  return BOUNDARY_UNITS.has(unit as BoundaryUnit);
}

interface Shiftable<S> {
  shift(amount: number, unit: Unit): S;
  startOf(unit: BoundaryUnit): S;
  endOf(unit: BoundaryUnit): S;
}

export function applyModifier<S extends Shiftable<S>>(value: S, modifier: Modifier): S {
  return match(modifier)
    .with({ kind: "shift" }, ({ sign, amount, unit }) => value.shift(sign * amount, unit))
    .with({ kind: "boundary" }, ({ direction, unit }) => {
      if (!isBoundaryUnit(unit)) return value;
      return direction === "start" ? value.startOf(unit) : value.endOf(unit);
    })
    .exhaustive();
}

export function unapplyModifier(date: CalendarDate, modifier: Modifier): CalendarDate {
  return match(modifier)
    .with({ kind: "shift" }, ({ sign, amount, unit }) => date.shift(-1 * sign * amount, unit))
    .with({ kind: "boundary" }, () => date)
    .exhaustive();
}

export function applyModifiers<S extends Shiftable<S>>(value: S, modifiers: readonly Modifier[]): S {
  // v2 order: arithmetic shifts first, then boundary
  const shifts = modifiers.filter(
    (modifier): modifier is Extract<Modifier, { kind: "shift" }> => modifier.kind === "shift",
  );
  const boundaries = modifiers.filter(
    (modifier): modifier is Extract<Modifier, { kind: "boundary" }> => modifier.kind === "boundary",
  );
  let result = value;
  for (const modifier of shifts) result = applyModifier(result, modifier);
  for (const modifier of boundaries) result = applyModifier(result, modifier);
  return result;
}

export function unapplyModifiers(date: CalendarDate, modifiers: readonly Modifier[]): CalendarDate {
  const shifts = modifiers.filter(
    (modifier): modifier is Extract<Modifier, { kind: "shift" }> => modifier.kind === "shift",
  );
  let result = date;
  for (let i = shifts.length - 1; i >= 0; i--) {
    result = unapplyModifier(result, shifts[i]);
  }
  return result;
}
```

Note: `CalendarDate.startOf`/`endOf` accept `"decade"` (defined in `calendar-date.ts:79-97`), but `Clock.startOf`/`endOf` only accept `"hour"` plus the calendar units. Widening `BoundaryUnit` means CalendarDate.startOf gets called with `"hour"` — verify CalendarDate.startOf rejects/handles `"hour"`. If it doesn't compile, add an explicit guard:

```ts
.with({ kind: "boundary" }, ({ direction, unit }) => {
  if (!isBoundaryUnit(unit)) return value;
  // Some kinds may not support every boundary unit; ignore unsupported ones silently.
  try {
    return direction === "start" ? value.startOf(unit) : value.endOf(unit);
  } catch {
    return value;
  }
})
```

Prefer typing approach over try/catch when possible: widen `CalendarDate.startOf`/`endOf` parameter types to accept `"hour"` and have CalendarDate return `this` for that case. Inspect `src/calendar/calendar-date.ts:79`; if changing the signature is contained, do that.

- [ ] **Step 4: Run all tests + typecheck**

```bash
npm run test -- --run
npm run check:types
npm run check:lint
```

All existing CalendarDate-typed callers must still compile (the generic accepts `CalendarDate` since CalendarDate implements `Shiftable<CalendarDate>`).

- [ ] **Step 5: Commit**

```bash
git add src/templates/modifiers.ts src/templates/modifiers.test.ts src/calendar/calendar-date.ts
git commit -m "refactor(templates/modifiers): generalize over Shiftable interface"
```

---

## Task 4: Add `renderClock` in kinds.ts

**Files:**

- Modify: `src/templates/kinds.ts`
- Modify: `src/templates/kinds.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/templates/kinds.test.ts`:

```ts
import { Clock } from "@/calendar";

describe("renderClock", () => {
  it("renders Clock with default format when no override", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const spec = { kind: "clock" as const, value: Clock.now(), defaultFormat: "HH:mm" };
    expect(renderClock(spec, [])).toBe("10:37");
  });

  it("renders Clock with format override", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const spec = { kind: "clock" as const, value: Clock.now(), defaultFormat: "HH:mm" };
    expect(renderClock(spec, [], "HH:mm:ss")).toBe("10:37:42");
  });

  it("applies modifiers before rendering", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const spec = { kind: "clock" as const, value: Clock.now(), defaultFormat: "HH:mm" };
    const result = renderClock(spec, [{ kind: "shift", sign: -1, amount: 1, unit: "h" }]);
    expect(result).toBe("09:37");
  });
});
```

(Add the `renderClock` import to the file's imports at the top; will fail until Step 3.)

- [ ] **Step 2: Run tests, verify failure**

```bash
npm run test -- --run src/templates/kinds.test.ts
```

Expected: `renderClock is not exported`.

- [ ] **Step 3: Implement `renderClock`**

Append to `src/templates/kinds.ts`:

```ts
export function renderClock(
  spec: Extract<VariableSpec, { kind: "clock" }>,
  modifiers: readonly Modifier[],
  format?: string,
): string {
  const shifted = applyModifiers(spec.value, modifiers);
  return shifted.format(format ?? spec.defaultFormat);
}
```

Update `patternForKind`'s `case "clock"` to keep returning `".+?"` (already added in Task 2 as temporary; keep as-is — clock is wildcard for parse).

- [ ] **Step 4: Run tests + typecheck**

```bash
npm run test -- --run src/templates/kinds.test.ts
npm run check:types
npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/templates/kinds.ts src/templates/kinds.test.ts
git commit -m "feat(templates/kinds): add renderClock"
```

---

## Task 5: Wire clock kind through TemplateEngine

**Files:**

- Modify: `src/templates/engine.ts`
- Modify: `src/templates/engine.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/templates/engine.test.ts`:

```ts
import { Clock } from "@/calendar";

describe("renders clock variables", () => {
  it("renders with default format", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty().clock("time", Clock.now(), "HH:mm");
    expect(engine.renderString("now is {{time}}", context)).toBe("now is 10:37");
  });

  it("renders with format override", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty().clock("time", Clock.now(), "HH:mm");
    expect(engine.renderString("{{time:HH:mm:ss}}", context)).toBe("10:37:42");
  });

  it("applies modifiers and format", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty().clock("time", Clock.now(), "HH:mm");
    expect(engine.renderString("{{time-1h:HH:mm}}", context)).toBe("09:37");
  });
});

describe("non-invertible date and clock variables in parse path", () => {
  it("treats date with invertible:false as a wildcard", () => {
    const context = TemplateContext.empty()
      .date("date", CalendarDate.fromAnchor("2026-05-20" as AnchorString), "YYYY-MM-DD")
      .date("current_date", CalendarDate.today(), "YYYY-MM-DD", { invertible: false });
    const result = engine.parse(tokenize("{{current_date}}/{{date:YYYY-MM-DD}}.md"), "anything/2026-05-20.md", context);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      const date = result.value.get("date");
      expect(date?.kind === "date" && date.value.toAnchor()).toBe("2026-05-20");
    }
  });

  it("treats clock as a wildcard", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty()
      .date("date", CalendarDate.fromAnchor("2026-05-20" as AnchorString), "YYYY-MM-DD")
      .clock("time", Clock.now(), "HH:mm");
    const result = engine.parse(tokenize("{{time}}-{{date:YYYY-MM-DD}}.md"), "anything-2026-05-20.md", context);
    expect(result.kind).toBe("ok");
  });
});

describe("validation", () => {
  it("accepts :FORMAT on clock variables", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty().clock("time", Clock.now(), "HH:mm");
    const problems = engine.validate(tokenize("{{time:HH:mm:ss}}"), context);
    expect(problems).toEqual([]);
  });

  it("accepts modifiers on clock variables", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const context = TemplateContext.empty().clock("time", Clock.now(), "HH:mm");
    const problems = engine.validate(tokenize("{{time-1h}}"), context);
    expect(problems).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
npm run test -- --run src/templates/engine.test.ts
```

Expected: failures — current `#renderVariable` clock arm returns `token.raw` (placeholder from Task 2); `#compileMatcher` still has hardcoded `wildcardNames`.

- [ ] **Step 3: Wire clock through engine**

In `src/templates/engine.ts`:

(a) Replace the imports near the top to add `renderClock`:

```ts
import {
  parseDate,
  parseNumber,
  parseString,
  patternForKind,
  renderClock,
  renderDate,
  renderNumber,
  renderString,
} from "./kinds";
```

(b) Replace the `#renderVariable` body:

```ts
#renderVariable(token: Extract<Token, { kind: "variable" }>, context: TemplateContext): string {
  const spec = context.get(token.name);
  if (!spec) return token.raw;
  // v2 fidelity: modifiers and :format are only meaningful on date/clock kind.
  // For string/number variables with either present, emit the raw token unchanged.
  if (spec.kind !== "date" && spec.kind !== "clock" && (token.modifiers.length > 0 || token.format !== undefined)) {
    return token.raw;
  }
  return match(spec)
    .with({ kind: "string" }, (s) => renderString(s))
    .with({ kind: "number" }, (s) => renderNumber(s))
    .with({ kind: "date" }, (s) => renderDate(s, token.modifiers, token.format))
    .with({ kind: "clock" }, (s) => renderClock(s, token.modifiers, token.format))
    .exhaustive();
}
```

(c) Replace the hardcoded `wildcardNames` set in `#compileMatcher` (line 158) with a spec-driven check:

```ts
#compileMatcher(
  stream: TokenStream,
  context: TemplateContext,
): Result<{ regex: RegExp; captureTokens: Extract<Token, { kind: "variable" }>[] }, TemplateParseError> {
  const parts: string[] = ["^"];
  const captureTokens: Extract<Token, { kind: "variable" }>[] = [];

  const isWildcard = (spec: VariableSpec | undefined): boolean =>
    spec?.kind === "clock" || (spec?.kind === "date" && spec.invertible === false);

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
    const spec = context.get(token.name);
    if (isWildcard(spec)) {
      parts.push(".+?");
      continue;
    }
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
```

The old `wildcardNames` Set is removed.

(d) Update `validate` (line ~108) — the temporary loosening from Task 2 stays; the condition `spec.kind !== "date" && spec.kind !== "clock"` is correct for the final behavior. Verify it's still there.

- [ ] **Step 4: Run tests + typecheck + lint**

```bash
npm run test -- --run
npm run check:types
npm run check:lint
```

All previously-passing tests still pass; new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/templates/engine.ts src/templates/engine.test.ts
git commit -m "feat(templates/engine): render clock variables, spec-driven invertibility"
```

---

## Task 6: NotePathService.contextFor adds clock/current_date variables

**Files:**

- Modify: `src/journals/notes/note-path.ts`
- Modify: `src/journals/notes/note-path.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/journals/notes/note-path.test.ts` (find the existing `describe("contextFor", …)` or add new describe):

```ts
import { Clock } from "@/calendar";

describe("contextFor — render-time variables", () => {
  it("exposes current_date with the dateFormat as default", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture(); // existing test helper; see file
    const context = service.contextFor(config, metadata);
    const spec = context.get("current_date");
    expect(spec?.kind).toBe("date");
    expect(spec?.kind === "date" && spec.value.toAnchor()).toBe("2026-05-20");
    expect(spec?.kind === "date" && spec.invertible).toBe(false);
  });

  it("exposes time and current_time as the same clock spec object", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
    const context = service.contextFor(config, metadata);
    const time = context.get("time");
    const currentTime = context.get("current_time");
    expect(time?.kind).toBe("clock");
    expect(time).toBe(currentTime); // identity, not just equality
    expect(time?.kind === "clock" && time.defaultFormat).toBe("HH:mm");
  });
});
```

If `buildFixture()` doesn't exist in the test file, write one that creates a minimal `NotePathService` with `SettingsService`/`CycleService` fakes plus a journal config and metadata. Follow existing patterns in the test file (and use `@/journals/notes/testing.ts` if one exists; otherwise add the helper inline).

- [ ] **Step 2: Run tests, verify failure**

```bash
npm run test -- --run src/journals/notes/note-path.test.ts
```

Expected: failures (`current_date`/`time`/`current_time` absent from context).

- [ ] **Step 3: Extend `contextFor`**

Edit `src/journals/notes/note-path.ts:contextFor`:

```ts
import { CalendarDate, Clock } from "@/calendar";

// ... inside the class:

contextFor(config: JournalConfig, metadata: JournalMetadata): TemplateContext {
  const dateValue = CalendarDate.fromAnchor(metadata.anchor);
  const startOpt = this.#cycle.startOf(config.name, metadata.anchor);
  const endOpt =
    metadata.endDate === undefined
      ? this.#cycle.endOf(config.name, metadata.anchor)
      : Option.some(CalendarDate.fromAnchor(metadata.endDate));
  let context = TemplateContext.empty()
    .date("date", dateValue, config.dateFormat)
    .string("journal_name", config.name);
  if (startOpt.isSome()) context = context.date("start_date", startOpt.value, config.dateFormat);
  if (endOpt.isSome()) context = context.date("end_date", endOpt.value, config.dateFormat);
  for (const source of config.numbering.sources) {
    const value = metadata.numbers?.[source.variable];
    if (value !== undefined) context = context.number(source.variable, value);
  }
  // Render-time snapshots — invertible:false so they don't enter the filename→date round-trip.
  context = context.date("current_date", CalendarDate.today(), "YYYY-MM-DD", { invertible: false });
  const clockSpec = { kind: "clock", value: Clock.now(), defaultFormat: "HH:mm" } as const;
  context = context.withSpec("time", clockSpec).withSpec("current_time", clockSpec);
  return context;
}
```

The `withSpec` calls register both `time` and `current_time` pointing at the **same** spec object — that's the identity test.

- [ ] **Step 4: Run tests + typecheck + lint**

```bash
npm run test -- --run src/journals/notes/note-path.test.ts
npm run check:types
npm run check:lint
```

Existing tests for `pathFor` and `candidateFor` must still pass — the round-trip is preserved because clock + current_date are wildcarded by Task 5's `isWildcard` check.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/note-path.ts src/journals/notes/note-path.test.ts
git commit -m "feat(journals/notes/note-path): expose current_date/time/current_time in path context"
```

---

## Task 7: Add `bodyContextFor` with note_name/title

**Files:**

- Modify: `src/journals/notes/note-path.ts`
- Modify: `src/journals/notes/note-path.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `note-path.test.ts`:

```ts
describe("bodyContextFor", () => {
  it("composes contextFor and adds note_name / title", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
    const body = service.bodyContextFor(config, metadata, "2026-05-20");
    const noteName = body.get("note_name");
    const title = body.get("title");
    expect(noteName?.kind).toBe("string");
    expect(noteName?.kind === "string" && noteName.value).toBe("2026-05-20");
    expect(noteName).toBe(title); // identity aliasing
    // path-context variables are inherited
    expect(body.get("date")).toBeDefined();
    expect(body.get("current_date")).toBeDefined();
    expect(body.get("time")).toBeDefined();
  });

  it("does not expose note_name in the path context", () => {
    const { service, config, metadata } = buildFixture();
    const path = service.contextFor(config, metadata);
    expect(path.get("note_name")).toBeUndefined();
    expect(path.get("title")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
npm run test -- --run src/journals/notes/note-path.test.ts
```

Expected: `service.bodyContextFor is not a function`.

- [ ] **Step 3: Implement `bodyContextFor`**

Append a method to `NotePathService`:

```ts
bodyContextFor(config: JournalConfig, metadata: JournalMetadata, noteName: string): TemplateContext {
  const base = this.contextFor(config, metadata);
  const noteSpec = { kind: "string", value: noteName } as const;
  return base.withSpec("note_name", noteSpec).withSpec("title", noteSpec);
}
```

- [ ] **Step 4: Run tests + typecheck + lint**

```bash
npm run test -- --run src/journals/notes/note-path.test.ts
npm run check:types
npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/note-path.ts src/journals/notes/note-path.test.ts
git commit -m "feat(journals/notes/note-path): add bodyContextFor with note_name/title"
```

---

## Task 8: Thread noteName through TemplateContentService.renderFor

**Files:**

- Modify: `src/journals/notes/template-content.ts`
- Modify: `src/journals/notes/template-content.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/journals/notes/template-content.test.ts`:

```ts
describe("renderFor — note_name binding", () => {
  it("exposes note_name to template body", async () => {
    const { service, noteName, journalName, metadata, writeTemplate } = buildFixture({
      template: "# {{note_name}}\n\nDate: {{date}}",
      noteName: "2026-05-20",
    });
    await writeTemplate();
    const result = await service.renderFor(journalName, metadata, noteName).run();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.value).toContain("# 2026-05-20");
    }
  });

  it("title aliases note_name in template body", async () => {
    const { service, noteName, journalName, metadata, writeTemplate } = buildFixture({
      template: "{{title}}",
      noteName: "my-note",
    });
    await writeTemplate();
    const result = await service.renderFor(journalName, metadata, noteName).run();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.value).toBe("my-note");
    }
  });

  it("renders templatePath without note_name (path context)", async () => {
    // configure config.templates = ["{{note_name}}"] — template path resolves with raw token
    // since path context lacks note_name; the file lookup should fail, yielding empty body.
    const { service, noteName, journalName, metadata } = buildFixture({
      templatePathHasNoteName: true,
      noteName: "anything",
    });
    const result = await service.renderFor(journalName, metadata, noteName).run();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.value).toBe("");
    }
  });
});
```

Adapt `buildFixture` to the existing fixture style in the file. The key behaviors to assert: body uses body context (has `note_name`/`title`), templatePath uses path context (no `note_name`).

- [ ] **Step 2: Run tests, verify failure**

```bash
npm run test -- --run src/journals/notes/template-content.test.ts
```

Expected: failure — `renderFor` accepts only two args, and body context lacks `note_name`.

- [ ] **Step 3: Update `renderFor`**

Edit `src/journals/notes/template-content.ts`:

```ts
renderFor(
  name: string,
  metadata: JournalMetadata,
  noteName: string,
): AsyncResult<string, JournalNotFoundError | NoteReadError> {
  const config = this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
  if (!config) return AsyncResult.err(new JournalNotFoundError(name));
  if (config.templates.length === 0) return AsyncResult.ok("");

  const pathContext = this.#path.contextFor(config, metadata);
  const bodyContext = this.#path.bodyContextFor(config, metadata, noteName);

  return AsyncResult.fromPromise(
    (async () => {
      for (const entry of config.templates) {
        const withExtension = entry.endsWith(".md") ? entry : `${entry}.md`;
        const renderedPath = this.#engine.renderString(withExtension, pathContext) as VaultPath;
        if (this.#notes.find(renderedPath).isNone()) continue;
        const readResult = await this.#notes.read(renderedPath);
        if (readResult.isErr()) throw readResult.error;
        return this.#engine.renderString(readResult.value, bodyContext);
      }
      return "";
    })(),
    (cause) => cause as JournalNotFoundError | NoteReadError,
  );
}
```

The templatePath is rendered with `pathContext` (no `note_name`); the body uses `bodyContext`.

- [ ] **Step 4: Run tests + typecheck + lint**

```bash
npm run test -- --run src/journals/notes/template-content.test.ts
npm run check:types
npm run check:lint
```

Compile failures will surface at all `renderFor(name, metadata)` callers (note-creation.ts:73, 94). Leave them broken for Task 9.

Actually — to keep the tree green, temporarily patch the call sites in `note-creation.ts:73` and `:94` to pass `this.#basename(path)` as the third arg now. Confirm the helper exists at the class. Then both calls compile.

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/template-content.ts src/journals/notes/template-content.test.ts src/journals/notes/note-creation.ts
git commit -m "feat(journals/notes/template-content): pass noteName to renderFor for body context"
```

---

## Task 9: Confirm note-creation passes basename and add test coverage

**Files:**

- Modify: `src/journals/notes/note-creation.ts` (verify Task 8 patch)
- Modify: `src/journals/notes/note-creation.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/journals/notes/note-creation.test.ts`:

```ts
describe("note creation — body uses rendered basename", () => {
  it("renders {{note_name}} in template body matching the created file's basename", async () => {
    const { service, journalName, metadata, fakeNotes, templateContent } = buildFixture({
      nameTemplate: "{{date:YYYY-MM-DD}}",
      template: "Hello {{note_name}}",
      anchor: "2026-05-20",
    });
    await templateContent(); // pre-populate the template file
    const result = await service.createNote(journalName, metadata).run();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      const written = fakeNotes.contentOf(result.value.path);
      expect(written).toBe("Hello 2026-05-20.md");
    }
  });
});
```

Adapt to the existing fixture style. The assertion is that the body received the basename of the rendered path (filename including `.md` extension — verify against `this.#basename` semantics in note-creation.ts).

If `#basename` strips the extension, adjust the assertion to `"Hello 2026-05-20"`. Check `src/journals/notes/note-creation.ts` for the helper's definition.

- [ ] **Step 2: Run tests, verify**

```bash
npm run test -- --run src/journals/notes/note-creation.test.ts
```

Should pass already if Task 8 patched the call sites correctly. If failure, fix the basename passing.

- [ ] **Step 3: Verify both call sites**

In `src/journals/notes/note-creation.ts`, both line 73 and line 94 (inside `attachNote`) must pass `this.#basename(path)`:

```ts
const content = yield * this.#content.renderFor(name, metadata, this.#basename(path));
```

- [ ] **Step 4: Run full tests + typecheck + lint**

```bash
npm run test -- --run
npm run check:types
npm run check:lint
```

- [ ] **Step 5: Commit**

```bash
git add src/journals/notes/note-creation.ts src/journals/notes/note-creation.test.ts
git commit -m "test(journals/notes/note-creation): body renders with file basename"
```

---

## Task 10: Add VariableChip component with click-to-copy

**Files:**

- Create: `src/journals/settings/ui/VariableChip.vue`
- Create: `src/journals/settings/ui/VariableChip.test.ts`
- Modify: `messages/en.json`

- [ ] **Step 1: Write failing tests**

Create `src/journals/settings/ui/VariableChip.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import VariableChip from "./VariableChip.vue";

const writeText = vi.fn().mockResolvedValue(undefined);

vi.stubGlobal("navigator", {
  clipboard: { writeText },
});

afterEach(() => {
  cleanup();
  writeText.mockClear();
});

describe("VariableChip", () => {
  it("renders the variable name wrapped in double-curly braces", () => {
    render(VariableChip, { props: { name: "date" } });
    expect(screen.getByText("{{date}}")).toBeInTheDocument();
  });

  it("copies the variable token to the clipboard on click", async () => {
    render(VariableChip, { props: { name: "date" } });
    await userEvent.click(screen.getByText("{{date}}"));
    expect(writeText).toHaveBeenCalledWith("{{date}}");
  });
});
```

- [ ] **Step 2: Add i18n key**

Edit `messages/en.json` (insert alphabetically; near other variable-related keys):

```json
"variable_chip_copied": "Copied",
```

- [ ] **Step 3: Run tests, verify failure**

```bash
npm run test -- --run src/journals/settings/ui/VariableChip.test.ts
```

Expected: module-not-found for `VariableChip.vue`.

- [ ] **Step 4: Implement the component**

Create `src/journals/settings/ui/VariableChip.vue`:

```vue
<script setup lang="ts">
import { useClipboard } from "@vueuse/core";

import { m } from "@/i18n";

const props = defineProps<{ name: string }>();
const token = `{{${props.name}}}`;
const { copy, copied } = useClipboard({ copiedDuring: 1500 });
</script>

<template>
  <code class="variable-chip" role="button" tabindex="0" @click="copy(token)" @keydown.enter="copy(token)">
    {{ token }}
    <span v-if="copied" class="variable-chip__copied">{{ m.variable_chip_copied() }}</span>
  </code>
</template>

<style scoped>
.variable-chip {
  cursor: pointer;
  user-select: none;
}
.variable-chip:hover {
  text-decoration: underline dotted;
}
.variable-chip__copied {
  margin-left: 0.5em;
  font-size: 0.85em;
  opacity: 0.7;
}
</style>
```

- [ ] **Step 5: Run tests + typecheck + lint**

```bash
npm run test -- --run src/journals/settings/ui/VariableChip.test.ts
npm run check:types
npm run check:lint
```

- [ ] **Step 6: Commit**

```bash
git add src/journals/settings/ui/VariableChip.vue src/journals/settings/ui/VariableChip.test.ts messages/en.json
git commit -m "feat(journals/settings/ui): VariableChip with click-to-copy"
```

---

## Task 11: Add DateModificationsModal

**Files:**

- Create: `src/journals/settings/ui/DateModificationsModal.vue`
- Create: `src/journals/settings/ui/DateModificationsModal.test.ts`
- Create: `src/journals/settings/ui/date-modifications-modal.ts`
- Modify: `messages/en.json`

- [ ] **Step 1: Add i18n keys**

Append to `messages/en.json` (alphabetic placement):

```json
"variable_modifications_boundary_body": "Snap a date variable to the start or end of a calendar period by adding `<startOf=unit>` or `<endOf=unit>`.",
"variable_modifications_boundary_example_caption": "For example {{date<startOf=year>}} renders January 1st of the date's year.",
"variable_modifications_boundary_heading": "Snap to start or end of period",
"variable_modifications_boundary_units_intro": "Supported units:",
"variable_modifications_combined_body": "All three modifications can be combined. Shifts apply first, then boundaries, then the format override.",
"variable_modifications_combined_example_caption": "For example {{date+1w<startOf=week>:MMM DD, YYYY}} shifts the date one week forward, snaps to the start of that week, and formats it.",
"variable_modifications_combined_heading": "Combined",
"variable_modifications_format_body": "Override the default date format by adding a colon and a moment.js format string.",
"variable_modifications_format_example_caption": "For example {{date:YYYY}} renders only the year.",
"variable_modifications_format_heading": "Format override",
"variable_modifications_format_link": "moment.js format reference",
"variable_modifications_intro": "Date and clock variables support three kinds of modifications. They can be combined in a single token.",
"variable_modifications_shift_body": "Add or subtract a number of units by appending `+N<unit>` or `-N<unit>`.",
"variable_modifications_shift_example_caption": "For example {{date+1w}} shifts the date forward by one week.",
"variable_modifications_shift_heading": "Arithmetic shifts",
"variable_modifications_shift_units_intro": "Supported units:",
"variable_modifications_unit_d": "d — days",
"variable_modifications_unit_h": "h — hours",
"variable_modifications_unit_m": "m — months",
"variable_modifications_unit_q": "q — quarters",
"variable_modifications_unit_w": "w — weeks",
"variable_modifications_unit_y": "y — years",
"variable_modifications_boundary_unit_day": "day",
"variable_modifications_boundary_unit_decade": "decade (date only)",
"variable_modifications_boundary_unit_hour": "hour (clock only)",
"variable_modifications_boundary_unit_month": "month",
"variable_modifications_boundary_unit_quarter": "quarter",
"variable_modifications_boundary_unit_week": "week",
"variable_modifications_boundary_unit_year": "year",
"variable_modifications_modal_title": "Date variable modifications",
```

- [ ] **Step 2: Create the modal definition**

Create `src/journals/settings/ui/date-modifications-modal.ts`:

```ts
import type { Component } from "vue";

import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import DateModificationsModal from "./DateModificationsModal.vue";

export const dateModificationsModal: ModalDefinition<Record<string, never>, void> = defineModal({
  component: DateModificationsModal as Component,
  title: () => m.variable_modifications_modal_title(),
});
```

- [ ] **Step 3: Write failing component test**

Create `src/journals/settings/ui/DateModificationsModal.test.ts`:

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import DateModificationsModal from "./DateModificationsModal.vue";

afterEach(() => cleanup());

describe("DateModificationsModal", () => {
  it("renders the format-override example chip", () => {
    render(DateModificationsModal);
    expect(screen.getByText("{{date:YYYY}}")).toBeInTheDocument();
  });

  it("renders the shift example chip", () => {
    render(DateModificationsModal);
    expect(screen.getByText("{{date+1w}}")).toBeInTheDocument();
  });

  it("renders the boundary example chip", () => {
    render(DateModificationsModal);
    expect(screen.getByText("{{date<startOf=year>}}")).toBeInTheDocument();
  });

  it("renders the combined example chip", () => {
    render(DateModificationsModal);
    expect(screen.getByText("{{date+1w<startOf=week>:MMM DD, YYYY}}")).toBeInTheDocument();
  });

  it("lists every shift unit", () => {
    render(DateModificationsModal);
    for (const unit of ["d", "w", "m", "q", "y", "h"]) {
      expect(screen.getByText(new RegExp(`^${unit} — `))).toBeInTheDocument();
    }
  });

  it("lists every boundary unit", () => {
    render(DateModificationsModal);
    for (const unit of ["day", "week", "month", "quarter", "year", "decade", "hour"]) {
      expect(screen.getByText(new RegExp(`^${unit}`))).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 4: Run tests, verify failure**

```bash
npm run test -- --run src/journals/settings/ui/DateModificationsModal.test.ts
```

Expected: module-not-found.

- [ ] **Step 5: Implement the modal**

Create `src/journals/settings/ui/DateModificationsModal.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";

import VariableChip from "./VariableChip.vue";

const shiftUnits = [
  { key: "d", label: () => m.variable_modifications_unit_d() },
  { key: "w", label: () => m.variable_modifications_unit_w() },
  { key: "m", label: () => m.variable_modifications_unit_m() },
  { key: "q", label: () => m.variable_modifications_unit_q() },
  { key: "y", label: () => m.variable_modifications_unit_y() },
  { key: "h", label: () => m.variable_modifications_unit_h() },
];

const boundaryUnits = [
  { key: "day", label: () => m.variable_modifications_boundary_unit_day() },
  { key: "week", label: () => m.variable_modifications_boundary_unit_week() },
  { key: "month", label: () => m.variable_modifications_boundary_unit_month() },
  { key: "quarter", label: () => m.variable_modifications_boundary_unit_quarter() },
  { key: "year", label: () => m.variable_modifications_boundary_unit_year() },
  { key: "decade", label: () => m.variable_modifications_boundary_unit_decade() },
  { key: "hour", label: () => m.variable_modifications_boundary_unit_hour() },
];
</script>

<template>
  <div class="date-modifications">
    <p>{{ m.variable_modifications_intro() }}</p>

    <h4>{{ m.variable_modifications_format_heading() }}</h4>
    <p>{{ m.variable_modifications_format_body() }}</p>
    <p>
      <VariableChip name="date:YYYY" />
    </p>
    <p>{{ m.variable_modifications_format_example_caption() }}</p>
    <p>
      <a href="https://momentjs.com/docs/#/displaying/format/" target="_blank" rel="noopener">
        {{ m.variable_modifications_format_link() }}
      </a>
    </p>

    <h4>{{ m.variable_modifications_shift_heading() }}</h4>
    <p>{{ m.variable_modifications_shift_body() }}</p>
    <p>
      <VariableChip name="date+1w" />
    </p>
    <p>{{ m.variable_modifications_shift_example_caption() }}</p>
    <p>{{ m.variable_modifications_shift_units_intro() }}</p>
    <ul>
      <li v-for="unit in shiftUnits" :key="unit.key">{{ unit.label() }}</li>
    </ul>

    <h4>{{ m.variable_modifications_boundary_heading() }}</h4>
    <p>{{ m.variable_modifications_boundary_body() }}</p>
    <p>
      <VariableChip name="date<startOf=year>" />
    </p>
    <p>{{ m.variable_modifications_boundary_example_caption() }}</p>
    <p>{{ m.variable_modifications_boundary_units_intro() }}</p>
    <ul>
      <li v-for="unit in boundaryUnits" :key="unit.key">{{ unit.label() }}</li>
    </ul>

    <h4>{{ m.variable_modifications_combined_heading() }}</h4>
    <p>{{ m.variable_modifications_combined_body() }}</p>
    <p>
      <VariableChip name="date+1w<startOf=week>:MMM DD, YYYY" />
    </p>
    <p>{{ m.variable_modifications_combined_example_caption() }}</p>
  </div>
</template>
```

- [ ] **Step 6: Run tests + typecheck + lint**

```bash
npm run test -- --run src/journals/settings/ui/DateModificationsModal.test.ts
npm run check:types
npm run check:lint
```

- [ ] **Step 7: Commit**

```bash
git add src/journals/settings/ui/DateModificationsModal.vue src/journals/settings/ui/DateModificationsModal.test.ts src/journals/settings/ui/date-modifications-modal.ts messages/en.json
git commit -m "feat(journals/settings/ui): DateModificationsModal with grammar reference"
```

---

## Task 12: Rewrite VariableReferenceModal as context-aware

**Files:**

- Create: `src/journals/settings/ui/variable-context.ts`
- Modify: `src/journals/settings/ui/VariableReferenceModal.vue`
- Modify: `src/journals/settings/ui/variable-reference-modal.ts`
- Modify: `messages/en.json`

- [ ] **Step 1: Add the shared context type**

Create `src/journals/settings/ui/variable-context.ts`:

```ts
export type VariableModalContext = "name-template" | "folder-path" | "template-path";
```

- [ ] **Step 2: Add i18n keys**

Append to `messages/en.json`:

```json
"journal_edit_variable_additional_modifications_link": "additional modifications",
"journal_edit_variable_current_date_description": "Today's date (in YYYY-MM-DD by default).",
"journal_edit_variable_current_time_description": "Current wall-clock time (alias of {{time}}, in HH:mm by default).",
"journal_edit_variable_non_invertible_warning": "Using this here prevents the journal from recovering the date from the filename.",
"journal_edit_variable_note_name_description": "The note's own filename. (Body templates only.)",
"journal_edit_variable_time_description": "Current wall-clock time (in HH:mm by default).",
"journal_edit_variable_title_description": "Alias of {{note_name}}, for core-template compatibility. (Body templates only.)",
```

(Existing key `journal_edit_variable_numbering_description` already exists; `note_name`/`title` keys are added but only consumed by tests that confirm the rules table — actual modal doesn't render them since they're filtered. We keep them for symmetry and so a future body-template modal can reuse them.)

Actually since `note_name`/`title` are hidden in all three current contexts, you may omit those two keys. Add them only if a test asserts the description text. Keep this minimal — drop the two `_note_name_/_title_` keys unless used.

- [ ] **Step 3: Update modal definition's prop shape**

Edit `src/journals/settings/ui/variable-reference-modal.ts`:

```ts
import type { Component } from "vue";

import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import VariableReferenceModal from "./VariableReferenceModal.vue";
import type { VariableModalContext } from "./variable-context";

export const variableReferenceModal: ModalDefinition<
  {
    context: VariableModalContext;
    journalName: string;
    dateFormat: string;
    hasCycle: boolean;
    numberingVariableNames: readonly string[];
  },
  void
> = defineModal({
  component: VariableReferenceModal as Component,
  title: () => m.journal_edit_variable_reference_modal_title(),
});
```

- [ ] **Step 4: Write failing tests**

Replace the relevant `describe()`s in `src/journals/settings/ui/VariableReferenceModal.test.ts` (create the file if it doesn't exist):

```ts
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import VariableReferenceModal from "./VariableReferenceModal.vue";
import type { VariableModalContext } from "./variable-context";

afterEach(() => cleanup());

function renderModal(props: {
  context: VariableModalContext;
  hasCycle?: boolean;
  numberingVariableNames?: readonly string[];
}) {
  render(VariableReferenceModal, {
    props: {
      journalName: "daily",
      dateFormat: "YYYY-MM-DD",
      hasCycle: false,
      numberingVariableNames: [],
      ...props,
    },
  });
}

describe("VariableReferenceModal — rules table", () => {
  for (const context of ["name-template", "folder-path", "template-path"] as const) {
    describe(context, () => {
      it("renders the date variable", () => {
        renderModal({ context });
        expect(screen.getByText("{{date}}")).toBeInTheDocument();
      });

      it("renders the journal_name variable", () => {
        renderModal({ context });
        expect(screen.getByText("{{journal_name}}")).toBeInTheDocument();
      });

      it("omits start_date and end_date when hasCycle is false", () => {
        renderModal({ context, hasCycle: false });
        expect(screen.queryByText("{{start_date}}")).toBeNull();
        expect(screen.queryByText("{{end_date}}")).toBeNull();
      });

      it("renders start_date and end_date when hasCycle is true", () => {
        renderModal({ context, hasCycle: true });
        expect(screen.getByText("{{start_date}}")).toBeInTheDocument();
        expect(screen.getByText("{{end_date}}")).toBeInTheDocument();
      });

      it("renders one row per numbering variable name", () => {
        renderModal({ context, numberingVariableNames: ["week_no", "page_no"] });
        expect(screen.getByText("{{week_no}}")).toBeInTheDocument();
        expect(screen.getByText("{{page_no}}")).toBeInTheDocument();
      });

      it("never renders note_name or title", () => {
        renderModal({ context });
        expect(screen.queryByText("{{note_name}}")).toBeNull();
        expect(screen.queryByText("{{title}}")).toBeNull();
      });

      it("renders current_date, time, current_time", () => {
        renderModal({ context });
        expect(screen.getByText("{{current_date}}")).toBeInTheDocument();
        expect(screen.getByText("{{time}}")).toBeInTheDocument();
        expect(screen.getByText("{{current_time}}")).toBeInTheDocument();
      });
    });
  }

  describe("non-invertibility warning", () => {
    it("shows the warning on clock vars in name-template", () => {
      renderModal({ context: "name-template" });
      const warnings = screen.getAllByText(/recovering the date from the filename/i);
      expect(warnings.length).toBeGreaterThanOrEqual(3); // current_date + time + current_time
    });

    it("shows the warning on clock vars in folder-path", () => {
      renderModal({ context: "folder-path" });
      expect(screen.getAllByText(/recovering the date from the filename/i).length).toBeGreaterThanOrEqual(3);
    });

    it("does NOT show the warning in template-path", () => {
      renderModal({ context: "template-path" });
      expect(screen.queryByText(/recovering the date from the filename/i)).toBeNull();
    });
  });

  describe("additional-modifications link", () => {
    it("renders a link on every date/clock row", () => {
      renderModal({ context: "name-template" });
      const links = screen.getAllByRole("link", { name: /additional modifications/i });
      // date + start? + end? + current_date + time + current_time → 4 with hasCycle:false
      expect(links.length).toBe(4);
    });
  });
});
```

- [ ] **Step 5: Run tests, verify failure**

```bash
npm run test -- --run src/journals/settings/ui/VariableReferenceModal.test.ts
```

Expected: failures across the board.

- [ ] **Step 6: Rewrite the modal**

Replace `src/journals/settings/ui/VariableReferenceModal.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";

import { dateModificationsModal } from "./date-modifications-modal";
import VariableChip from "./VariableChip.vue";
import type { VariableModalContext } from "./variable-context";

const props = defineProps<{
  context: VariableModalContext;
  journalName: string;
  dateFormat: string;
  hasCycle: boolean;
  numberingVariableNames: readonly string[];
}>();

const modals = useService(ModalService);
const NON_INVERTIBLE_CONTEXTS = new Set<VariableModalContext>(["name-template", "folder-path"]);
const showInvertibilityWarning = computed(() => NON_INVERTIBLE_CONTEXTS.has(props.context));

function openModifications(event: Event): void {
  event.preventDefault();
  void modals.open(dateModificationsModal, {});
}
</script>

<template>
  <div class="variable-reference">
    <p>{{ m.journal_edit_variable_reference_intro({ dateFormat }) }}</p>
    <dl class="variable-reference__list">
      <div class="variable-reference__row">
        <dt><VariableChip name="date" /></dt>
        <dd>
          {{ m.journal_edit_variable_date_description() }}
          <a href="#" @click="openModifications">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
        </dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip :name="`date:${dateFormat}`" /></dt>
        <dd>{{ m.journal_edit_variable_date_format_description() }}</dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="journal_name" /></dt>
        <dd>{{ m.journal_edit_variable_journal_name_description({ name: journalName }) }}</dd>
      </div>

      <template v-if="hasCycle">
        <div class="variable-reference__row">
          <dt><VariableChip name="start_date" /></dt>
          <dd>
            {{ m.journal_edit_variable_start_date_description() }}
            <a href="#" @click="openModifications">
              {{ m.journal_edit_variable_additional_modifications_link() }}
            </a>
          </dd>
        </div>
        <div class="variable-reference__row">
          <dt><VariableChip name="end_date" /></dt>
          <dd>
            {{ m.journal_edit_variable_end_date_description() }}
            <a href="#" @click="openModifications">
              {{ m.journal_edit_variable_additional_modifications_link() }}
            </a>
          </dd>
        </div>
      </template>

      <div v-for="numberingName in numberingVariableNames" :key="numberingName" class="variable-reference__row">
        <dt><VariableChip :name="numberingName" /></dt>
        <dd>{{ m.journal_edit_variable_numbering_description() }}</dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="current_date" /></dt>
        <dd>
          {{ m.journal_edit_variable_current_date_description() }}
          <a href="#" @click="openModifications">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
          <p v-if="showInvertibilityWarning" class="variable-reference__warning">
            {{ m.journal_edit_variable_non_invertible_warning() }}
          </p>
        </dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="time" /></dt>
        <dd>
          {{ m.journal_edit_variable_time_description() }}
          <a href="#" @click="openModifications">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
          <p v-if="showInvertibilityWarning" class="variable-reference__warning">
            {{ m.journal_edit_variable_non_invertible_warning() }}
          </p>
        </dd>
      </div>

      <div class="variable-reference__row">
        <dt><VariableChip name="current_time" /></dt>
        <dd>
          {{ m.journal_edit_variable_current_time_description() }}
          <a href="#" @click="openModifications">
            {{ m.journal_edit_variable_additional_modifications_link() }}
          </a>
          <p v-if="showInvertibilityWarning" class="variable-reference__warning">
            {{ m.journal_edit_variable_non_invertible_warning() }}
          </p>
        </dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.variable-reference__list {
  display: grid;
  gap: 0.75em;
}
.variable-reference__row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75em;
  align-items: baseline;
}
.variable-reference__warning {
  margin-top: 0.25em;
  font-size: 0.85em;
  color: var(--text-warning, var(--text-muted));
}
</style>
```

The modal test must construct a `ModalService` for the `useService` call to resolve. Update the test fixture to provide DI like `VariableReferenceHint.test.ts` does (build a `Container`, register `ModalService` with `FakeModalService`, install via `provideInjectorOnApp`).

Update the test file's `renderModal` helper accordingly:

```ts
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";

function renderModal(props: { … }) {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  render(VariableReferenceModal, {
    props: { … },
    global: {
      plugins: [{ install(app) { provideInjectorOnApp(app, container); } }],
    },
  });
  return { modals };
}
```

Add one more test that verifies clicking the modifications link opens the sub-modal:

```ts
it("opens the modifications sub-modal when the link is clicked", async () => {
  const { modals } = renderModal({ context: "name-template" });
  await userEvent.click(screen.getAllByRole("link", { name: /additional modifications/i })[0]);
  expect(modals.opens.length).toBe(1);
  expect(modals.lastOpen().definition).toBe(dateModificationsModal);
});
```

- [ ] **Step 7: Run tests + typecheck + lint**

```bash
npm run test -- --run src/journals/settings/ui/VariableReferenceModal.test.ts
npm run check:types
npm run check:lint
```

- [ ] **Step 8: Commit**

```bash
git add src/journals/settings/ui/VariableReferenceModal.vue src/journals/settings/ui/variable-reference-modal.ts src/journals/settings/ui/variable-context.ts src/journals/settings/ui/VariableReferenceModal.test.ts messages/en.json
git commit -m "feat(journals/settings/ui): context-aware VariableReferenceModal"
```

---

## Task 13: Update VariableReferenceHint props and forwarding

**Files:**

- Modify: `src/journals/settings/ui/VariableReferenceHint.vue`
- Modify: `src/journals/settings/ui/VariableReferenceHint.test.ts`

- [ ] **Step 1: Update failing tests**

Replace `src/journals/settings/ui/VariableReferenceHint.test.ts`:

```ts
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";

import { variableReferenceModal } from "./variable-reference-modal";
import VariableReferenceHint from "./VariableReferenceHint.vue";

afterEach(() => cleanup());

function build() {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  return { modals, container };
}

const baseProps = {
  context: "name-template" as const,
  journalName: "daily",
  dateFormat: "YYYY-MM-DD",
  hasCycle: false,
  numberingVariableNames: [] as readonly string[],
};

describe("VariableReferenceHint", () => {
  it("opens the variable reference modal with forwarded props", async () => {
    const { modals, container } = build();
    render(VariableReferenceHint, {
      props: baseProps,
      global: {
        plugins: [
          {
            install(app) {
              provideInjectorOnApp(app, container);
            },
          },
        ],
      },
    });
    await userEvent.click(screen.getByRole("link"));
    expect(modals.opens.length).toBe(1);
    const lastOpen = modals.lastOpen();
    expect(lastOpen.definition).toBe(variableReferenceModal);
    expect(lastOpen.props).toEqual(baseProps);
  });

  it("forwards numberingVariableNames when provided", async () => {
    const { modals, container } = build();
    render(VariableReferenceHint, {
      props: { ...baseProps, numberingVariableNames: ["week_no"] },
      global: {
        plugins: [
          {
            install(app) {
              provideInjectorOnApp(app, container);
            },
          },
        ],
      },
    });
    await userEvent.click(screen.getByRole("link"));
    expect(modals.lastOpen().props).toMatchObject({ numberingVariableNames: ["week_no"] });
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

```bash
npm run test -- --run src/journals/settings/ui/VariableReferenceHint.test.ts
```

Expected: failure — current hint props don't include `context`/`hasCycle`/`numberingVariableNames`.

- [ ] **Step 3: Update the hint**

Replace `src/journals/settings/ui/VariableReferenceHint.vue`:

```vue
<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";

import { variableReferenceModal } from "./variable-reference-modal";
import type { VariableModalContext } from "./variable-context";

const props = defineProps<{
  context: VariableModalContext;
  journalName: string;
  dateFormat: string;
  hasCycle: boolean;
  numberingVariableNames: readonly string[];
}>();

const modals = useService(ModalService);

function show(event: Event): void {
  event.preventDefault();
  void modals.open(variableReferenceModal, {
    context: props.context,
    journalName: props.journalName,
    dateFormat: props.dateFormat,
    hasCycle: props.hasCycle,
    numberingVariableNames: props.numberingVariableNames,
  });
}
</script>

<template>
  <a href="#" @click="show">{{ m.journal_edit_variable_reference_link() }}</a>
</template>
```

- [ ] **Step 4: Run tests + typecheck + lint**

```bash
npm run test -- --run src/journals/settings/ui/VariableReferenceHint.test.ts
npm run check:types
npm run check:lint
```

Compile failures expected in `JournalEditSubpage.vue` — that's Task 14.

- [ ] **Step 5: Commit**

```bash
git add src/journals/settings/ui/VariableReferenceHint.vue src/journals/settings/ui/VariableReferenceHint.test.ts
git commit -m "feat(journals/settings/ui): VariableReferenceHint forwards context + numbering list"
```

---

## Task 14: Wire JournalEditSubpage's three hint call sites

**Files:**

- Modify: `src/journals/settings/ui/JournalEditSubpage.vue`

- [ ] **Step 1: Inspect the existing call sites**

Open `src/journals/settings/ui/JournalEditSubpage.vue`. The three `<VariableReferenceHint …/>` invocations (lines ~178, ~200, ~255) currently pass:

```vue
:journal-name="journalName" :date-format="config.dateFormat" :has-numbering="config.numbering.enabled"
```

- [ ] **Step 2: Update each call site to the new prop shape**

For the nameTemplate site (~178):

```vue
<VariableReferenceHint
  context="name-template"
  :journal-name="journalName"
  :date-format="config.dateFormat"
  :has-cycle="hasCycle"
  :numbering-variable-names="numberingVariableNames"
/>
```

For the folderPath site (~200):

```vue
<VariableReferenceHint
  context="folder-path"
  :journal-name="journalName"
  :date-format="config.dateFormat"
  :has-cycle="hasCycle"
  :numbering-variable-names="numberingVariableNames"
/>
```

For the templatePath site (~255):

```vue
<VariableReferenceHint
  context="template-path"
  :journal-name="journalName"
  :date-format="config.dateFormat"
  :has-cycle="hasCycle"
  :numbering-variable-names="numberingVariableNames"
/>
```

- [ ] **Step 3: Add the derived refs near the top of `<script setup>`**

Inside `<script setup>`, after `config` is available (it's accessed as `config.dateFormat`, etc.), add:

```ts
import { computed } from "vue";
// existing imports …

const hasCycle = computed(() => config.value.type !== "day"); // verify property name; the cycle test is "journal has start/end period"
const numberingVariableNames = computed(() =>
  config.value.numbering.enabled ? config.value.numbering.sources.map((s) => s.variable) : [],
);
```

Note: `config` access patterns differ — it may be a `reactive` object, not a ref. Inspect the existing code in the file at the top of `<script setup>` and adapt accordingly. The `hasCycle` predicate should match the same condition `NotePathService` uses to decide whether `start_date`/`end_date` go into the path context. Read `cycle.startOf` / the cycle service to confirm — for v3 journal types, cycle exists for everything except `day` (verify against `src/journals/cycle/` or wherever `CycleService` lives). If unsure, use:

```ts
const hasCycle = computed(
  () =>
    config.value.type === "week" ||
    config.value.type === "month" ||
    config.value.type === "quarter" ||
    config.value.type === "year",
);
```

Pick what matches the file's existing pattern for related conditional UI.

- [ ] **Step 4: Run lint + typecheck + tests**

```bash
npm run check:types
npm run check:lint
npm run test -- --run
```

All previously-passing tests must still pass.

- [ ] **Step 5: Smoke-test in the browser**

```bash
npm run dev
```

In Obsidian (test vault), open journal settings → edit subpage. For each of the three fields (Name template, Folder, Templates), click "Supported variables" and verify:

- The modal opens.
- `note_name` / `title` are absent.
- `current_date`, `time`, `current_time` rows have the non-invertibility warning in name-template and folder-path; no warning in template-path.
- Numbering variable rows show the correct (configured) variable names.
- start_date / end_date show only if the journal has a cycle.
- Clicking any chip copies the token (verify with paste).
- Clicking "additional modifications" on any date/clock row opens the sub-modal.
- Sub-modal example chips render correctly and copy on click.

- [ ] **Step 6: Commit**

```bash
git add src/journals/settings/ui/JournalEditSubpage.vue
git commit -m "feat(journals/settings/ui): pass per-context props to variable reference hints"
```

---

## Task 15: Full verification

- [ ] **Step 1: Full unit + type + lint pass**

```bash
npm run test -- --run
npm run check:types
npm run check:lint
```

All must pass.

- [ ] **Step 2: E2E smoke**

```bash
npm run test:e2e:smoke
```

Per per-spec quality-gate from project memory.

- [ ] **Step 3: Final visual confirmation**

Repeat the browser smoke from Task 14 Step 5 after a fresh build to catch any HMR-only behaviors that don't survive a cold reload.

- [ ] **Step 4: Commit if any fixes**

No commit if all steps green.

---

## Self-review notes

- ✓ Every spec section mapped to a task: clock-kind types (Task 2), Clock methods (Task 1), modifier generalization (Task 3), renderClock (Task 4), engine wiring (Task 5), contextFor extensions (Task 6), bodyContextFor (Task 7), renderFor threading (Task 8), note-creation basename (Task 9), VariableChip (Task 10), DateModificationsModal (Task 11), VariableReferenceModal rewrite (Task 12), VariableReferenceHint update (Task 13), JournalEditSubpage call sites (Task 14).
- ✓ No placeholders; all code blocks contain the exact code the engineer types.
- ✓ Method signatures consistent: `contextFor`/`bodyContextFor` (Tasks 6/7) match `renderFor(name, metadata, noteName)` (Task 8) and `note-creation.ts:73,94` (Task 9). `VariableModalContext` (Task 12) consumed by `VariableReferenceHint` (Task 13) and the three subpage call sites (Task 14). `numberingVariableNames` shape is the same `readonly string[]` everywhere.
- ✓ TDD shape: every behavior change pairs a failing test with the implementation.
- ✓ Per-task quality gates match project memory: `npm run test`, `npm run check:types`, `npm run check:lint` per task; full `test:e2e:smoke` at completion.
