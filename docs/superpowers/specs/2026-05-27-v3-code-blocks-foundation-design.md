# v3 Code Blocks — Foundation + Home Pilot

## Goal

Establish the host-side primitive for registering Obsidian markdown code blocks under v3's DI conventions, and prove the primitive by porting one v2 block (`journals-home`) end-to-end. Subsequent specs port `navigation` and `timeline` against the same primitive.

## Background

v2 ships five markdown code-block keys backed by three Vue components:

| v2 key              | component             | parsing            |
| ------------------- | --------------------- | ------------------ |
| `journals-home`     | `HomeCodeBlock`       | YAML body          |
| `calendar-nav`      | `NavigationCodeBlock` | (source unused)    |
| `journal-nav`       | `NavigationCodeBlock` | (source unused)    |
| `interval-nav`      | `NavigationCodeBlock` | (source unused)    |
| `calendar-timeline` | `TimelineCodeBlock`   | `key: value` lines |

Each block lives in `src/_old-code/code-blocks/<name>/` with a `MarkdownRenderChild` subclass (`*-processor.ts`) that creates a Vue app, provides `PLUGIN_KEY`, mounts on `init`, and unmounts on `onunload`. Source parsing is hand-rolled per block; failures fall back to defaults via `try/catch`.

v3 has none of this wired in yet. The foundation work introduces a host primitive that owns the obsidian registration call, YAML parsing, schema validation, Vue mounting, DI provision, and teardown — so each block author writes only a schema and a Vue component.

## Scope

In scope for this spec:

- `infrastructure/host/code-blocks/` — `CodeBlockService`, `defineCodeBlock`, `CodeBlockDefinitionToken`, `VueCodeBlockHost`, error classes.
- `src/code-blocks/` — single feature module owning every block. Pilot ships with `home/` only.
- `src/calendar/relative-date.ts` — new helper with i18n applied to all non-weekday strings.
- Wiring `codeBlocksModule` into `main.ts`.

Out of scope (separate future specs):

- Porting `navigation` and `timeline` blocks.
- The per-journal `navBlock` config that `navigation` depends on.
- The `decorations` integration that `timeline` consumes.

## Architecture

```
src/
  infrastructure/host/
    code-blocks/
      index.ts                       barrel (public API)
      define-code-block.ts           defineCodeBlock factory
      types.ts                       CodeBlockDefinition / Input / Props / Config / Token
      errors.ts                      CodeBlockYamlError, CodeBlockSchemaError
      internal/
        code-block-service.ts        CodeBlockService
        vue-code-block-host.ts       extends MarkdownRenderChild
  calendar/
    relative-date.ts                 new helper
    relative-date.test.ts
  code-blocks/
    index.ts                         barrel (codeBlocksModule)
    module.ts                        codeBlocksModule
    home/
      home-block.ts                  defineCodeBlock(homeCodeBlock)
      home-config.ts                 valibot schema + inferred types
      home-config.test.ts
      home-items.ts                  buildHomeItems (pure)
      home-items.test.ts
      ui/HomeCodeBlock.vue
      ui/HomeCodeBlock.test.ts
  main.ts                            + container.addModule(codeBlocksModule)
```

Data flow on render:

1. Obsidian invokes the registered processor with `(source, el, ctx)`.
2. `CodeBlockService` parses `source` as YAML (after tab→spaces normalization). Empty source yields `{}`.
3. The result is validated against the definition's valibot schema (defaults fill in via `v.optional`).
4. Success → constructs `VueCodeBlockHost`, attaches as child of `ctx`. The host mounts the component with props `{ path, config }`, provides the DI injector, and applies any `cssClass`.
5. YAML or schema failure → no Vue mount; the service logs at error level and renders an inline error div with the message and (for schema errors) the issue paths.
6. On `onunload` → host unmounts the Vue app and clears the element.

## Host primitive

### Public API

`defineCodeBlock` is an identity factory that captures schema inference and gives consumers a uniform call-site, matching `defineModal` / `defineSuggest`.

```ts
export interface CodeBlockProps<TConfig> {
  readonly path: VaultPath;
  readonly config: TConfig;
}

export interface CodeBlockDefinitionInput<TSchema extends GenericSchema> {
  readonly keys: readonly [string, ...string[]];
  readonly schema: TSchema;
  readonly component: Component;
  readonly cssClass?: readonly string[];
}

export type CodeBlockDefinition<TSchema extends GenericSchema = GenericSchema> = CodeBlockDefinitionInput<TSchema>;

export type CodeBlockConfig<TDef> = TDef extends CodeBlockDefinition<infer S> ? InferOutput<S> : never;

export function defineCodeBlock<TSchema extends GenericSchema>(
  input: CodeBlockDefinitionInput<TSchema>,
): CodeBlockDefinition<TSchema>;

export const CodeBlockDefinitionToken = createMultiToken<CodeBlockDefinition>("host.codeBlock");
```

The component receives `defineProps<CodeBlockProps<HomeBlockConfig>>()` (or the per-block equivalent) and reads everything else from DI through `useService(...)`.

### Service

`CodeBlockService` is the only host class that touches obsidian's plugin registration:

```ts
class CodeBlockService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #injector = inject(InjectorToken);
  readonly #logger = inject(LoggerFactoryToken).named("code-block-service");
  readonly #defs = inject(CodeBlockDefinitionToken);

  constructor() {
    for (const def of this.#defs) this.#registerDefinition(def);
  }
}
```

On construction it iterates the multi-bound definitions and registers each key with the plugin. Eager binding (`.eager()`) in the host module ensures construction during `autoLoad`, before the workspace becomes ready.

YAML parsing normalizes tabs to double-spaces (preserves v2 behavior for tab-indented bodies). Empty/whitespace-only source becomes `{}` so schema defaults fully populate the config.

`VueCodeBlockHost` extends `MarkdownRenderChild`. It owns the Vue app lifecycle, calls `provideInjectorOnApp(app, injector)`, applies the definition's `cssClass`, and unmounts in `onunload`.

### Errors

Both classes live in `infrastructure/host/code-blocks/errors.ts`.

```ts
class CodeBlockYamlError extends Error {
  readonly cause: unknown;
}
class CodeBlockSchemaError extends Error {
  readonly key: string;
  readonly issues: readonly BaseIssue<unknown>[];
}
```

Each is logged before the inline error div is rendered. The div uses class `code-block-error`; styles ship with the block, not with the host primitive (v2 had no styled error UI).

### Host module wiring

`createHostModule` adds:

```ts
c.register(CodeBlockService).useClass(CodeBlockService).eager();
```

Default `Container` lifetime (no `.lifetime(...)` call). The barrel re-exports `CodeBlockService`, `defineCodeBlock`, `CodeBlockDefinitionToken`, `CodeBlockProps`, `CodeBlockConfig`, `CodeBlockDefinition`, `CodeBlockDefinitionInput`, `CodeBlockYamlError`, `CodeBlockSchemaError`.

## Pilot block — `journals-home`

### Schema

```ts
const periodKinds = ["day", "week", "month", "quarter", "year"] as const;

const homeEntrySchema = v.union([...periodKinds.map((p) => v.literal(p)), v.literal("custom")]);

export const homeBlockSchema = v.object({
  show: v.optional(v.array(homeEntrySchema), () => ["day"] as const),
  separator: v.optional(v.string(), " • "),
  scale: v.optional(v.number(), 1),
  shelf: v.optional(v.string()),
});

export type HomeBlockConfig = v.InferOutput<typeof homeBlockSchema>;
export type HomeEntry = v.InferOutput<typeof homeEntrySchema>;
```

`periodKinds` is added to the `@/calendar` barrel as part of this work.

### Item builder

`buildHomeItems(config, journals, today, shelf)` is a pure function returning the list to render. Inputs are plain `JournalConfig[]` and primitive values; no DI fixture required for tests.

For each entry in `config.show`:

- `"custom"` → one item per custom-write journal matching the shelf filter; label is the rendered note name for today's anchor — derived from `NotePathService.pathFor(journal, { anchor: today, journalName })` and trimmed to the basename (segment after the final `/`). When `pathFor` returns `Err`, the journal is omitted.
- a fixed period → one item, label = `relativeDate(period, today)`, `journalNames` = all matching fixed-write journals.

Empty inputs yield `[]`. Entries with no matching journals are omitted.

### Component

A thin SFC: reads `path` + `config` from props, pulls services via `useService` (`Clock`, `JournalsRepository`, `JournalsIndex`, `Flows`), computes the item list with `buildHomeItems`, and dispatches `OpenDateFlow` on click with the open mode derived from the event.

Template ports v2's layout 1:1: a centered flex row, separator spans between items, font-size driven by `v-bind('config.scale')`.

### Module

```ts
export const codeBlocksModule: Module = {
  register(c) {
    c.register(CodeBlockDefinitionToken).useValue(homeCodeBlock);
  },
};
```

Future blocks add sibling `useValue(...)` lines. `main.ts` adds `container.addModule(codeBlocksModule)` alongside the other feature modules; module order doesn't matter because eager `CodeBlockService` construction during `autoLoad` collects all multi-bindings.

## Relative date helper

`src/calendar/relative-date.ts` ports v2 `_old-code/calendar.ts` lines 84–191 with i18n applied to user-facing strings.

```ts
export type RelativePeriod = Exclude<PeriodKind, "decade">;

export function relativeDate(period: RelativePeriod, anchor: AnchorString, today: AnchorString): string;
```

Dispatch on `period` uses `ts-pattern`'s `match().with().exhaustive()` (per the v3 conventions).

- **day** — `moment(anchor).calendar(today, formats)`. Formats compose paraglide-returned literals with bracket-escaped `dddd` weekday tokens; weekday names come from moment locale, never from paraglide.
- **week / month / quarter / year** — compute `fromNow = anchor.startOf(period).diff(today.startOf(period), period)` and return one of: `"This <period>"`, `"Last <period>"`, `"Next <period>"`, `"N <periods> ago"`, `"N <periods> from now"`.

i18n keys live under `code_blocks.home.relative_date.*` and cover every textual phrase except weekday/month names.

The function is pure: total over its typed inputs, no exceptions, no errors.

## Error handling

| Surface                   | Behavior                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| YAML parse failure        | Log + inline error div via `CodeBlockYamlError`.                                                 |
| Schema validation failure | Log + inline error div listing issue paths via `CodeBlockSchemaError`.                           |
| Open-date click           | `Flows.invoke(OpenDateFlow, …)` result `void`'d; existing flow surfaces failures via Notice/log. |
| Item building             | Total; empty/invalid filtered before reaching the builder.                                       |
| `relativeDate`            | Pure; no throw paths.                                                                            |

## Testing

| Subject            | File                                                                  | Style                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `CodeBlockService` | `infrastructure/host/code-blocks/internal/code-block-service.test.ts` | Container + fake plugin; assert obsidian-registration calls, mount, unmount, error rendering. Stub component for mount assertions.     |
| Home schema        | `code-blocks/home/home-config.test.ts`                                | `v.safeParse` happy + invalid paths.                                                                                                   |
| Home item builder  | `code-blocks/home/home-items.test.ts`                                 | Pure-function tests with literal inputs.                                                                                               |
| Home component     | `code-blocks/home/ui/HomeCodeBlock.test.ts`                           | `@testing-library/vue` + `user-event`; container fixture with fake `Clock`/`JournalsRepository`/`JournalsIndex` + `Flows` test double. |
| Relative date      | `calendar/relative-date.test.ts`                                      | One `describe` per period; paraglide bootstrap reused.                                                                                 |

Explicitly **not** tested: `defineCodeBlock` identity factory, `VueCodeBlockHost` directly (observed through service tests), `codeBlocksModule` DI shape, `main.ts` wiring, the test fakes themselves.

Verification gates before completion: `npm test`, `npm run check:types`, `npm run check:lint`.
