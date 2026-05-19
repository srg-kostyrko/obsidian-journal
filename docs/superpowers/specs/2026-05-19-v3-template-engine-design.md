# v3 Template Engine — Design

**Stage:** Note creation foundation for the v3 plugin rewrite
**Date:** 2026-05-19
**Status:** Draft for review

## Purpose

Note creation in v3 needs to render filenames, folder paths, template-file
paths, and template-file contents from user-authored templates that
contain `{{variable}}` tokens. The engine that does this work also needs
to invert the same templates: given a vault path, recover the date (and
optionally the numbering values) that produced it, so the journals layer
can discover whether an arbitrary file belongs to a journal.

v2 had a single function, `replaceTemplateVariables`, that did forward
substitution with a regex-per-variable strategy. It is not reusable: it
hard-codes the variable set, it cannot be inverted, and it has no
extension point for new variable categories. This spec replaces it with
a parser-driven engine in a new `src/templates/` feature folder.

Goals:

- **Full v2 parity** for forward rendering of the existing variable set
  (`date`, `start_date`, `end_date`, `journal_name`, `index`,
  `note_name`, `title`, `time`, `current_time`, `current_date`) including
  arithmetic (`+1d`, `-1w`, `+1q`, `+1y`, `+1m`), boundary shifts
  (`<startOf=week>`, `<endOf=decade>`), and format overrides (`:MMM D, YYYY`).
- **Reverse parse** of `nameTemplate` + `folder` against a vault path,
  returning a "best-fit" date plus any captured numbering values, so the
  journals layer can connect arbitrary notes (v2 bulk-add use case
  generalized to template-aware matching).
- **Extension point** for `journal_link(...)` and other future
  function-style variables (issue [#103]) without engine changes.
- **Per-journal dynamic vocabulary** for numbering sources (the
  user-configurable `variable` name on each `NumberingSource`).

## Non-goals

- **No reverse parse of template-file content.** Only `nameTemplate` and
  `folder` are inverted. Template content can use function variables
  (`journal_link`) that are non-invertible by design.
- **No new variable syntax beyond what v2 already supports plus the
  `(arg)` slot for function variables.** No nested templates, no escape
  sequences for `{{` / `}}`, no conditional/loop constructs. Those belong
  to a future spec if they ever land.
- **No Templater bridge.** `tryApplyingTemplater` in v2 is a separate
  concern (Templater plugin integration) that lives outside the
  template engine. The note-IO spec will port it.
- **No commands, no settings UI, no note IO.** This spec delivers the
  engine and its testing surface only. Settings-UI validators that use
  the engine's walker are sketched in §7 but their settings-page
  integration is in the journal-settings spec.
- **No `Result`-returning render API.** Render is total and v2-fidelity
  pass-through on every failure mode (see §4). Callers that want
  validation use a separate walker (§7).

## Architecture

### Layout

```
src/templates/
├── index.ts                  # public barrel
├── types.ts                  # Token, TokenStream, TemplateContext, Bindings, BoundValue, Modifier, FunctionInput
├── errors.ts                 # TemplatesError, TemplateParseError, TemplateRenderError
├── grammar.ts                # tokenize(template) → TokenStream; pure
├── format-regex.ts           # formatToRegexp(format) → string (ported from _old-code/utils/moment.ts)
├── modifiers.ts              # applyModifier / unapplyModifier
├── kinds.ts                  # render & parse for string/number/date
├── handlers.ts               # FunctionHandler interface + FunctionHandlerToken multi-token
├── context.ts                # TemplateContext (fluent builder + lookup)
├── engine.ts                 # TemplateEngine: renderString, renderStream, parse, validate
├── module.ts                 # templatesModule (DI binding)
└── testing.ts                # TemplateContext builders, fake handler, sample streams

src/calendar/
└── calendar-date.ts          # adds shift(amount, unit) / startOf(unit) / endOf(unit)
```

Tests are colocated (`grammar.test.ts`, `engine.test.ts`, etc.). No
`index.test.ts`, no `module.test.ts` per [[feedback_no_wiring_tests]].

### Dependencies

The engine has two DI deps:

- `Clock` — for `current_date` / `current_time` / `time` resolution.
- `FunctionHandlerToken` (multi-token) — resolves at construction to a
  `FunctionHandler[]`; the engine builds a `Map<name, FunctionHandler>`
  in its constructor.

Nothing in `src/templates/` imports from `src/journals/` or any other
feature. Feature folders that want to extend the engine bind their
handler classes to `FunctionHandlerToken` in their own modules.

### Why a separate feature folder

The engine is consumed by note creation, settings-UI validators, future
code-block UI, and (probably) the migration code that needs to validate
v2 templates carry forward. Living under `src/journals/` would invert
the dependency. `src/templates/` parallels `src/calendar/` —
domain-neutral primitives that the rest of the codebase composes.

## Grammar

### EBNF

```
template     = ( literal | token )*
token        = "{{" name arglist? modifier* format? "}}"
name         = [a-zA-Z_][a-zA-Z0-9_]*
arglist      = "(" arg ")"           # raw string until ")"; trimmed; cannot contain ")"
modifier     = arithmetic | shift
arithmetic   = ("+" | "-") digits unit
unit         = "y" | "q" | "m" | "w" | "d" | "h"
shift        = "<" ("startOf" | "endOf") "=" word ">"
format       = ":" format-chars      # everything until "}}"
literal      = any text outside "{{...}}"
```

Whitespace inside `{{ … }}` is permitted around the name and between
modifiers (v2 fidelity). The format slot is whitespace-significant and
may contain colons (e.g. `HH:mm:ss`).

### AST

```ts
type Token =
  | { kind: "literal"; text: string }
  | { kind: "variable"; name: string; modifiers: Modifier[]; format?: string }
  | { kind: "function"; name: string; arg: string; modifiers: Modifier[]; format?: string };

type Modifier =
  | { kind: "shift"; sign: 1 | -1; amount: number; unit: "y" | "q" | "m" | "w" | "d" | "h" }
  | { kind: "boundary"; direction: "start" | "end"; unit: string };

type TokenStream = readonly Token[];
```

### Tokenizer behavior

`tokenize(template: string): TokenStream` is pure, total, never throws.

- A well-formed `{{ … }}` block whose contents match the grammar
  produces a `variable` or `function` token.
- A malformed block (missing `}}`, illegal name, unparsable modifier)
  is emitted as a single `literal` token containing the raw text from
  the opening `{{` up to and including the closing `}}` (or to the end
  of the template if there is no closing). This preserves v2's
  pass-through behavior on broken templates.
- Token-stream caching: a bounded LRU keyed by the raw template string,
  default size 256, kept inside `tokenize`. Optional — drop if benching
  shows it doesn't matter.

## Kinds and Function Handlers

### Plain kinds (closed set)

Three kinds. Each is a small set of pure functions in `kinds.ts`.

```ts
type VarSpec =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: CalendarDate; defaultFormat: string };
```

| Kind   | Render                                | Parse pattern                | Modifier handling | `:format` slot          |
| ------ | ------------------------------------- | ---------------------------- | ----------------- | ----------------------- |
| string | `value`                               | `.+?` (non-greedy)           | ignored           | ignored                 |
| number | `value.toString()`                    | `-?\d+`                      | ignored           | ignored                 |
| date   | `apply(modifiers, value).format(fmt)` | `formatToRegexp(fmt).source` | applied (see §6)  | overrides defaultFormat |

String/number ignoring modifiers and `:format` matches v2 exactly:
`{{journal_name+1d:foo}}` produced `${journal_name}` verbatim in v2, and
will in v3. Surface this via the settings-UI validator (§7), not via
engine-time errors.

### Function handlers (open registry via multi-token DI)

```ts
// src/templates/handlers.ts
export interface FunctionHandler {
  readonly name: string;
  render(input: FunctionInput): Result<string, TemplateRenderError>;
}

export interface FunctionInput {
  arg: string; // trimmed raw arg
  sourceDate: CalendarDate; // engine has applied modifiers to ctx["date"] (or Clock.now() if absent)
  format?: string; // raw format slot, handler decides whether to use
  ctx: TemplateContext;
  engine: TemplateEngine; // for recursion; passed in to avoid DI cycles
}

export const FunctionHandlerToken = createMultiToken<FunctionHandler>("templates.FunctionHandler");
```

#### `journal_link` registration

```ts
// src/journals/module.ts (additive)
b.bind(FunctionHandlerToken).toClass(JournalLinkHandler);
```

```ts
// src/journals/journal-link-handler.ts
@injectable()
export class JournalLinkHandler implements FunctionHandler {
  readonly name = "journal_link";
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #settings = inject(SettingsService);

  render(input: FunctionInput): Result<string, TemplateRenderError> {
    // 1. settings.getCollection(journalConfigCollection).get(input.arg.trim())
    //    → JournalConfig | undefined; map undefined to Err(JournalNotFoundError-ish wrapped)
    // 2. cycle.cycleOf(targetJournal, input.sourceDate) → JournalCycle
    // 3. Build a TemplateContext for that journal (date=cycle.anchor, etc.)
    // 4. tokenize(targetJournal.nameTemplate) → stream
    // 5. input.engine.renderStream(stream, targetCtx) → filename
    // 6. tokenize(targetJournal.folder); render; concat with filename + ".md"
    //    → return the joined path (Obsidian wikilink-friendly; caller wraps in [[...]])
  }
}
```

Handler keeps zero state and zero DI deps beyond what it injects.
Recursion is bounded by template depth in user configs — typically zero
(no `journal_link` in target's name template) or one.

### Why multi-token DI, not a runtime registry

Handlers are static after boot. Multi-token bindings resolve once when
the engine constructs and the binding _is_ the registration. A separate
`FunctionHandlerRegistry` service would add a runtime mutation surface
no one needs and force an autoLoad step to register handlers per
[[feedback_di_eager_autoload]] — multi-token avoids both.

### Why recursion via `FunctionInput.engine`, not DI

Handler injecting the engine creates an engine → handlers → engine DI
cycle. Passing the engine through `FunctionInput` is also semantically
right: recursion is a per-call concern, not a structural dep. The
handler's only DI deps are the services it needs to resolve its target
(journal config + cycle).

## TemplateContext

```ts
class TemplateContext {
  static empty(): TemplateContext;
  string(name: string, value: string): TemplateContext;
  number(name: string, value: number): TemplateContext;
  date(name: string, value: CalendarDate, defaultFormat: string): TemplateContext;

  get(name: string): VarSpec | undefined; // for render
  spec(name: string): VarSpec | undefined; // for parse — same shape, may have placeholder values
}
```

Immutable: every mutator returns a new value (cheap — small underlying
`Map`). Construction lives in the journals layer:

```ts
function buildContextForEntry(
  journal: JournalConfig,
  entry: JournalEntry,
  numbers: Record<string, number>,
  clock: Clock,
): TemplateContext {
  let ctx = TemplateContext.empty()
    .date("date", entry.anchor, journal.dateFormat)
    .date("start_date", entry.startDate, journal.dateFormat)
    .date("end_date", entry.endDate, journal.dateFormat)
    .date("current_date", clock.today(), "YYYY-MM-DD")
    .date("current_time", clock.now(), "HH:mm")
    .date("time", clock.now(), "HH:mm")
    .string("journal_name", journal.name)
    .string("title", "") // recursive — see §4
    .string("note_name", "");
  for (const source of journal.numbering.sources) {
    ctx = ctx.number(source.variable, numbers[source.variable] ?? 0);
  }
  return ctx;
}
```

## Render API

```ts
@injectable()
export class TemplateEngine {
  readonly #clock = inject(Clock);
  readonly #handlersByName: ReadonlyMap<string, FunctionHandler>;

  constructor() {
    const handlers = inject(FunctionHandlerToken);
    this.#handlersByName = new Map(handlers.map((h) => [h.name, h]));
  }

  renderString(template: string, ctx: TemplateContext): string;
  renderStream(stream: TokenStream, ctx: TemplateContext): string;
}
```

Render is total. Every failure collapses to v2-fidelity pass-through:

- Unknown variable name → emit raw token text (e.g. `{{foo}}`).
- Function token with no registered handler → emit raw token text.
- Handler returns `Err(...)` → emit raw token text plus a `Logger.warn`.
- Variable token whose `ctx` spec has a kind mismatch with how it's used
  → emit raw token text.

Recursive `title` / `note_name`:

The engine does not bake in v2's two-pass quirk. The journals layer
performs the recursion explicitly:

```ts
let ctx = buildContextForEntry(journal, entry, numbers, clock);
const renderedName = engine.renderString(journal.nameTemplate, ctx);
ctx = ctx.string("title", renderedName).string("note_name", renderedName);
// then use ctx for folder, template path, template content
```

## Reverse Parse API

```ts
type BoundValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: CalendarDate };

type Bindings = ReadonlyMap<string, BoundValue>;

class TemplateEngine {
  parse(stream: TokenStream, input: string, ctx: TemplateContext): Result<Bindings, TemplateParseError>;
}
```

`ctx` is used in parse for _kinds and formats_, not values — the
journals layer reuses the same builder that produces render contexts;
values it puts in are ignored. Kind and `defaultFormat` are read.

### Matcher compilation

A single anchored regex (`^…$`) is compiled from the stream:

| Token                                                | Pattern contribution                         |
| ---------------------------------------------------- | -------------------------------------------- |
| `literal`                                            | `escapeRegex(text)`                          |
| `variable`, ctx kind = string                        | `(?<v_i>.+?)`                                |
| `variable`, ctx kind = number                        | `(?<v_i>-?\d+)`                              |
| `variable`, ctx kind = date, format `F`              | `(?<v_i>` + `formatToRegexp(F).source` + `)` |
| `variable` name ∈ {current_date, current_time, time} | `.+?` (no capture; treated as wildcard)      |
| `function` token                                     | parse rejects — see below                    |

Capture indices are positional. The engine keeps an `i → Token` array
for post-match dispatch.

### Per-token post-match

- **string**: store captured text under variable name.
- **number**: `parseInt(capture, 10)`; on `NaN` return
  `Err(TemplateParseError.invalidNumber)`.
- **date**:
  1. `CalendarDate.parse(capture, effectiveFormat)`. `Err` here means
     the regex matched something moment's strict parser will not accept;
     bubble up as `TemplateParseError.invalidDate`.
  2. Un-apply modifiers via `modifiers.ts` (reverse order):
     - `shift` → inverse arithmetic.
     - `boundary` → identity (information was destroyed; the parsed
       date carries forward as a representative; consistency checked in
       multi-binding resolution).
  3. Store the resulting `CalendarDate` under the variable name.

### Multi-binding resolution

If the same variable name appears in multiple tokens, parse collects
each token's candidate and resolves them:

- **string / number**: all candidates must be `===` equal; otherwise
  `Err(TemplateParseError.conflict)`.
- **date**: each token's candidate carries the modifier list that
  produced it. Two candidates are _consistent_ if there exists a source
  date `D` such that, for both tokens, `apply(modifiers, D)` formatted
  with that token's format yields the matched capture. The resolved
  binding is the smallest (most-specific) source date in the
  intersection — concretely: take the maximum (latest) of each
  candidate's lower bound. If the intersection is empty,
  `Err(conflict)`.

This implements "best-fit": a template like
`{{date<startOf=week>:YYYY-MM-DD}}-{{date<endOf=week>:YYYY-MM-DD}}.md`
matched against `2026-05-04-2026-05-10.md` resolves `date` to
`2026-05-04` (any day in that week would round-trip identically; the
start of the consistent range is chosen).

For a single-variable template like v2's `YYYY-MM-DD.md`, this reduces
to v2's behavior exactly.

### Errors

```ts
type TemplateParseErrorKind =
  | { kind: "no-match"; input: string }
  | { kind: "invalid-number"; capture: string; varName: string }
  | { kind: "invalid-date"; capture: string; varName: string; format: string }
  | { kind: "conflict"; varName: string }
  | { kind: "not-invertible"; reason: "function-token" | "unknown-variable"; offending: string };
```

`unknown-variable` is a parse error (not pass-through like render):
parse needs a kind to compile a pattern. Settings UI's validator (§7)
catches this before the user saves.

## Modifiers

`src/templates/modifiers.ts`, pure, no DI:

```ts
applyModifier(date: CalendarDate, m: Modifier): CalendarDate
unapplyModifier(date: CalendarDate, m: Modifier): CalendarDate
applyModifiers(date: CalendarDate, ms: Modifier[]): CalendarDate     // apply in array order
unapplyModifiers(date: CalendarDate, ms: Modifier[]): CalendarDate   // reverse order
```

Apply rules (matches v2's `processDateModifications`):

- `shift +Nu` / `-Nu` — `date.shift(±N, unit)`. Units: `y q m w d h`.
- `boundary <startOf=u>` — `date.startOf(u)`. Special-case `decade`:
  align to the decade's first/last year.
- `boundary <endOf=u>` — `date.endOf(u)`. Same `decade` special case.
- If both arithmetic and boundary modifiers exist on a token, apply
  arithmetic first, then boundary (v2 order).

Unapply rules:

- `shift +Nu` → `date.shift(-N, u)`.
- `shift -Nu` → `date.shift(+N, u)`.
- `boundary` → identity (information destroyed; multi-binding logic
  resolves consistency afterwards).

`h` unit is permitted by the grammar (v2 fidelity) but is a no-op on a
`CalendarDate` (which carries no hours). Tests document this.

### `CalendarDate` extensions

```ts
class CalendarDate {
  shift(amount: number, unit: "y" | "q" | "m" | "w" | "d" | "h"): CalendarDate;
  startOf(unit: "year" | "quarter" | "month" | "week" | "day" | "decade"): CalendarDate;
  endOf(unit: "year" | "quarter" | "month" | "week" | "day" | "decade"): CalendarDate;
}
```

Implemented by round-tripping through
`localMoment(anchor, ANCHOR_FORMAT, true)`. Adds tests in
`src/calendar/calendar-date.test.ts`.

## Errors

```ts
// src/templates/errors.ts
export class TemplatesError extends Error {
  /* base */
}

export class TemplateParseError extends TemplatesError {
  readonly kind: TemplateParseErrorKind["kind"];
  constructor(public readonly detail: TemplateParseErrorKind) {
    /* ... */
  }
}

export class TemplateRenderError extends TemplatesError {
  constructor(
    public readonly reason: string,
    public readonly cause?: unknown,
  ) {
    /* ... */
  }
}
```

Per [[feedback_errors_in_errors_ts]], every Error subclass is declared
in `errors.ts`. Render never throws; parse returns `Result<_, TemplateParseError>`;
handlers return `Result<string, TemplateRenderError>` which the engine
catches into pass-through.

## Validation walker (consumed by settings UI)

```ts
class TemplateEngine {
  validate(
    stream: TokenStream,
    ctx: TemplateContext,
    opts?: {
      allowFunctions?: boolean; // false for nameTemplate/folder
    },
  ): ValidationProblem[];
}

interface ValidationProblem {
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

The journal-settings-ui spec wires this into vee-validate so the user
sees inline problems as they type templates. This spec only defines the
walker.

## Testing strategy

Colocated tests:

```
src/templates/
├── grammar.test.ts
├── modifiers.test.ts
├── kinds.test.ts
├── engine.test.ts            # render + parse + validation
└── testing.ts                # builders, fake handler
src/calendar/
└── calendar-date.test.ts     # add: shift, startOf, endOf
```

### What's covered

- **Grammar**: every legal/illegal form from v2's
  `_old-code/utils/template.test.ts` ported; new function-token shape;
  malformed tokens pass through as literals.
- **Modifiers**: `for all arithmetic m: unapply(apply(d, m), m) === d`
  property; boundary modifiers documented as one-way.
- **Kinds**: render and parse for each of string/number/date in
  isolation, including format edge cases (`HH:mm:ss`, `[W]w`).
- **Engine**: end-to-end render (v2 parity table from `template.test.ts`
  becomes engine tests), parse for single/multi-binding/conflict cases,
  function dispatch via a fake handler bound to `FunctionHandlerToken`
  in test setup.
- **Validation walker**: function-in-name-template rejection,
  unknown-variable, format-on-non-date.

### What's not covered

Per [[feedback_no_wiring_tests]] / [[feedback_no_mock_fake_tests]]:

- No `module.test.ts`, no `index.test.ts`.
- No tests for `testing.ts` helpers.
- No test that `FunctionHandlerToken` multi-bindings resolve.
- No test of `JournalLinkHandler` here — that ships with its own
  integration test in `src/journals/`.

Per [[feedback_no_trivial_tests]] / [[feedback_black_box_assertions]]:
tests assert on rendered strings and parsed `Bindings`, not on internal
token shapes (except `grammar.test.ts`, where the token shape _is_ the
contract).

## Migration considerations

- v2's `replaceTemplateVariables` becomes dead code; the v3 engine
  fully replaces it.
- `formatToRegexp` is ported from `src/_old-code/utils/moment.ts` to
  `src/templates/format-regex.ts` (its tests come with it; trim away
  the unused locale-extraction helper that lives in the same v2 file
  for unrelated reasons).
- `journalDefaultsFor` and the journal-config schema do not change.
  Existing `nameTemplate`/`folder` strings from v2 are valid v3 inputs
  by construction (the grammar is a strict superset of v2's regex
  language).
- The v2→v3 lump-sum migration spec (per
  [[2026-05-15-v3-journal-entity-design]]) doesn't need to touch
  templates.

## Open questions

None. All design decisions in this spec were resolved during the
brainstorm. Implementation order and rollout sequencing belong to the
implementation plan.
