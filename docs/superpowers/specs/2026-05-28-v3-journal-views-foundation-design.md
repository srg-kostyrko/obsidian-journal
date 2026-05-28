# v3 journal views — foundation design

## Goal

Land the infrastructure for v3 journal views: data shape, persistence, service surface, Obsidian view registration, leaf-state contract, and the `defineViewBlock` registration API. **No blocks, no toolbar items, no settings UI, no migration, no default view.** Subsequent PRs add the MVP block catalogue, settings UI, migration, default Calendar view, and legacy `CALENDAR_VIEW_TYPE` adapter. Scopes down the broader spec in `2026-05-28-v3-journal-views-design.md` to a single landable foundation.

## Background

The broader v3 journal-views design replaces v2's single hardcoded calendar view with a system of user-defined views, each composed of an ordered list of configurable blocks. That design covers infrastructure + MVP blocks + toolbar items + settings UI + migration + default view + legacy adapter. This foundation spec covers only the infrastructure layer; everything else stays deferred.

The system follows the same shape as `src/code-blocks/`: a `defineXxx` factory, a `XxxDefinitionToken` multi-binding, and a service that collects definitions on construction. The repository / service / events / module wiring follows `src/shelves/` as the canonical small-feature reference.

## Scope

In scope:

- `src/views/` feature with: schemas, repository, service, view-host service, view-leaf, view-context, `defineViewBlock` API, registration tokens, errors, module wiring, testing helpers, barrel.
- One-line `src/main.ts` change: `container.addModule(viewsModule)`.

Out of scope (deferred to follow-up PRs):

- `defineToolbarItem` API + `ToolbarItemDefinitionToken` (lands with the `toolbar` block).
- Any block implementation (`toolbar`, `month-calendar`, `custom-intervals`, `divider`).
- Settings UI (`ViewsDashboardBlock`, `ViewEditSubpage`, modals, edit-subpage definition).
- v2 → v3 migration of `uiSettings.calendarShelf`, `calendarViewSettings.*`, per-journal `calendarViewBlock`.
- `intervalBlock` field on `JournalConfig` (lands with the `custom-intervals` block).
- Default seeded Calendar view + `defaultCalendarViewId` slice key.
- Legacy `CALENDAR_VIEW_TYPE` adapter.
- Deletion of `src/_old-code/calendar-view/`.
- Per-block per-leaf state (`perBlock` field on leaf state).
- `ViewsLifecycleFlowError` / `toFlowError` (lands when a flow consumes the service).

## Architecture

### File layout

```
src/views/
  config.ts                  schemas + viewsCollection
  config.test.ts
  errors.ts                  UnknownViewError,
                             DuplicateBlockInstanceIdError,
                             InvalidViewBlockConfigError,
                             UnknownViewBlockKeyError,
                             InvalidViewNameError
  tokens.ts                  ViewBlockDefinitionToken (multi),
                             ViewsEventsToken
  define-view-block.ts       defineViewBlock factory + types
  repository.ts              ViewsRepository extends BaseRepository
  repository.test.ts
  service.ts                 ViewsService — CRUD via attempt.in, emits events,
                             owns Map<key, ViewBlockDefinition> built from
                             inject(ViewBlockDefinitionToken)
  service.test.ts
  view-context.ts            provideViewContext / useViewContext + ViewContextKey
  view-context.test.ts
  view-host.ts               ViewHostService — register / registerAll / dispose
  view-host.test.ts
  view-leaf.ts               JournalViewLeaf extends ItemView
  view-leaf.test.ts
  module.ts                  viewsModule
  testing.ts                 fakeViewsRepo, provideViewContextStub, mountViewBlock
  index.ts                   barrel (no test helpers, per [[feedback_barrel_files]])
```

External touches:

- `src/main.ts` — add `container.addModule(viewsModule);` after `shelvesModule` and before `codeBlocksModule`.

No separate `view-block-registry.ts` file. View-block lookup is a private `Map<string, ViewBlockDefinition>` inside `ViewsService`, populated from `inject(ViewBlockDefinitionToken)` in the field initializer. Symmetric with how `CodeBlockService` consumes its multi-token. Per [[feedback_minimal_expressive_apis]].

### Public API

```ts
// src/views/define-view-block.ts
export interface ViewBlockDefinitionInput<TConfig> {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly schema: BaseSchema<unknown, TConfig, BaseIssue<unknown>>;
  readonly defaultConfig: TConfig;
  readonly component: Component<ViewBlockProps<TConfig>>;
  readonly configComponent?: Component<{
    config: TConfig;
    onChange: (next: TConfig) => void;
  }>;
  readonly cssClass?: string | readonly string[];
}

export interface ViewBlockDefinition<TConfig = unknown> extends ViewBlockDefinitionInput<TConfig> {
  readonly __brand: "view-block";
}

export interface ViewBlockProps<TConfig> {
  readonly instanceId: BlockInstanceId;
  readonly config: TConfig;
}

export function defineViewBlock<TConfig>(input: ViewBlockDefinitionInput<TConfig>): ViewBlockDefinition<TConfig>;
```

```ts
// src/views/view-context.ts
export interface ViewContext {
  readonly viewId: ViewId;
  readonly viewName: Readonly<Ref<string>>;
  readonly refDate: Readonly<Ref<AnchorString>>;
  readonly shelf: Readonly<Ref<ShelfId | null>>;
  setRefDate(date: AnchorString): void;
  setShelf(shelf: ShelfId | null): void;
}

export function provideViewContext(ctx: ViewContext): void;
export function useViewContext(): ViewContext; // throws if no provider
```

```ts
// src/views/tokens.ts
export const ViewBlockDefinitionToken = createMultiToken<ViewBlockDefinition>("views.block");
export const ViewsEventsToken = createToken<Emitter<ViewsEvents>>("views.events");

export interface ViewsEvents {
  created: (id: ViewId) => void;
  deleted: (id: ViewId) => void;
  updated: (id: ViewId) => void;
}
```

Bare-verb event names match the journals convention (e.g. `JournalsEvents.renamed`). `updated` collapses rename / icon / ribbon / blocks changes into a single event; consumers (specifically `ViewHostService`) unconditionally re-sync command label + ribbon entry on each fire. `created` and `deleted` stay separate because they trigger different host actions (registerView+command+ribbon vs detach+remove).

```ts
// src/views/service.ts
export class ViewsService {
  create(input: {
    name: string;
    icon?: string;
    defaultShelf?: ShelfId | null;
    showInRibbon?: boolean;
  }): AsyncResult<ViewId, ViewsLifecycleError>;

  clone(id: ViewId): AsyncResult<ViewId, UnknownViewError>;

  update(
    id: ViewId,
    patch: Partial<Pick<View, "name" | "icon" | "defaultShelf" | "showInRibbon">>,
  ): AsyncResult<void, UnknownViewError | ViewsLifecycleError>;

  delete(id: ViewId): AsyncResult<void, UnknownViewError>;

  addBlock(id: ViewId, key: string): AsyncResult<BlockInstanceId, UnknownViewError | UnknownViewBlockKeyError>;

  removeBlock(id: ViewId, blockId: BlockInstanceId): AsyncResult<void, UnknownViewError>;

  moveBlockUp(id: ViewId, blockId: BlockInstanceId): AsyncResult<void, UnknownViewError>;

  moveBlockDown(id: ViewId, blockId: BlockInstanceId): AsyncResult<void, UnknownViewError>;

  updateBlockConfig(
    id: ViewId,
    blockId: BlockInstanceId,
    config: unknown,
  ): AsyncResult<void, UnknownViewError | InvalidViewBlockConfigError>;

  getBlockDefinition(key: string): Option<ViewBlockDefinition>;
}
```

Each mutation is a single `attempt.in(this, function* () { ... })` block per [[feedback_attempt_in_over_this_shadow]]. Reads (`get`, `list`) live on `ViewsRepository`, not on the service. `update` takes a partial patch; schema validation per field already lives in `viewSchema`, so the service merges + writes + emits. Block ops stay granular because they're structural (different return types, different errors). `moveBlockUp` / `moveBlockDown` no-op at array boundaries (return Ok). A future drag-reorder UI can add `reorderBlocks` then — YAGNI for foundation.

### Schemas

```ts
// src/views/config.ts
const viewIdSchema = v.pipe(
  v.string(),
  v.uuid(),
  v.transform((s) => s as ViewId),
);

const blockInstanceIdSchema = v.pipe(
  v.string(),
  v.uuid(),
  v.transform((s) => s as BlockInstanceId),
);

const viewBlockInstanceSchema = v.object({
  id: blockInstanceIdSchema,
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
});

const viewSchema = v.object({
  id: viewIdSchema,
  name: v.pipe(v.string(), v.minLength(1)),
  icon: v.pipe(v.string(), v.minLength(1)),
  defaultShelf: v.nullable(v.string()),
  showInRibbon: v.boolean(),
  blocks: v.array(viewBlockInstanceSchema),
});

export type View = v.InferOutput<typeof viewSchema>;
export type ViewId = string & { readonly __brand: "view-id" };
export type BlockInstanceId = string & { readonly __brand: "block-instance-id" };

export const viewsCollection = defineCollection("views", viewSchema, (id) => ({
  id: id as ViewId,
  name: id,
  icon: "calendar-days",
  defaultShelf: null,
  showInRibbon: false,
  blocks: [],
}));
```

Brands are structural per [[feedback_no_unique_symbol_brands]]. Per-block `config` is `Record<string, unknown>` at the collection level; `ViewsService.updateBlockConfig` runs `v.safeParse` against the registered definition's schema before persisting; `JournalViewLeaf`'s block-host wrapper validates again at render time and silently skips on failure.

Foundation note: the views collection starts empty. No migration runs and no default view is seeded, so `ViewsRepository.list()` is `[]` until something — a test or a future PR — calls `ViewsService.create(...)`.

### Leaf state

```ts
interface JournalViewLeafState {
  refDate?: AnchorString; // omitted -> today on next open
  shelf?: ShelfId | null; // omitted -> view.defaultShelf
}
```

No `perBlock` field — added when the first block needs it. Schema is additive; existing leaves keep working.

### Obsidian view registration

ViewType: `journal-view:<viewId>`.

`ViewHostService.register(viewId): Disposer`:

1. `plugin.registerView(viewType, (leaf) => new JournalViewLeaf(leaf, viewId, container))`
2. `DynamicCommandRegistry.register({ id: "journal:open-view:<viewId>", name: "Open " + view.name, callback: openLeaf })`
3. If `view.showInRibbon`: `plugin.addRibbonIcon(view.icon, view.name, openLeaf)`; retain returned `HTMLElement`.
4. Return per-view `Disposer` that:
   - `app.workspace.detachLeavesOfType("journal-view:<viewId>")` — closes **every** open leaf of that viewType across all windows / workspaces.
   - `DynamicCommandRegistry.unregister("journal:open-view:<viewId>")`.
   - Removes the ribbon `HTMLElement` if it was added.
   - Marks the viewType "stale" in an internal `Set<ViewType>`. The original `registerView` cannot be revoked — Obsidian exposes no API. Future opens of a stale viewType land in a factory whose `JournalViewLeaf` constructor finds no config and renders an empty leaf (with a log line).

`ViewHostService.registerAll()` is invoked from the service's own `.eager()` construction path: iterates `ViewsRepository.list()` and calls `register(id)` for each, storing the per-view `Disposer` in an internal `Map<ViewId, Disposer>`. With an empty collection at foundation-time, this loop is a no-op until tests or future PRs add views.

`ViewHostService.dispose()` (plugin unload): iterates the `Map<ViewId, Disposer>` and calls each per-view disposer. Net effect: every open journal-view leaf closes, every per-view command and ribbon entry is removed. The stale-viewType `Set` persists internally so a re-registered foundation in the same Obsidian session routes correctly.

Event handlers wired in `ViewHostService` constructor:

- `created(id)` → call `register(id)`, store the returned `Disposer`.
- `deleted(id)` → look up the stored `Disposer`, call it, remove from the `Map`.
- `updated(id)` → re-sync command label + ribbon entry. No view-type re-registration. Cheap enough to run unconditionally — no diffing.

### Mid-life reactivity inside the leaf

`JournalViewLeaf.onOpen()` creates one Vue app on `this.contentEl`, calls `provideInjectorOnApp(app, container)`, and mounts a root component. The root:

1. Reads `useService(ViewsRepository).get(viewId)` reactively. If `None` (view was deleted while leaf is still open), renders a small "View was deleted" placeholder and stops.
2. Calls `provideViewContext(ctx)` once with the context built from leaf state.
3. `v-for` over `view.blocks` keyed by `block.id` — add / remove / move-up / move-down Just Works without manual mount / unmount.
4. Each block row resolves `block.key` via `ViewsService.getBlockDefinition(key)`:
   - Miss → log `UnknownViewBlockKeyError(key)`, render nothing for that row.
   - Hit → wrap the block component in a `<BlockHost>` that runs `v.safeParse(definition.schema, block.config)`:
     - Fail → log `InvalidViewBlockConfigError(viewId, blockId, key, issues)`, render nothing.
     - Pass → render `<definition.component :instanceId="block.id" :config="parsed">`. `config` is a reactive proxy slice of the underlying `view.blocks[i].config`.

When `name` / `icon` / `defaultShelf` / `showInRibbon` change, the leaf's Vue tree does not need to react — those drive the Obsidian-side command / ribbon / title via `ViewHostService`. The leaf only re-renders on `blocks` mutations and on its own `refDate` / `shelf` setters.

### Errors

```ts
// src/views/errors.ts
export class UnknownViewError extends Error {
  readonly kind = "unknown-view" as const;
  constructor(public readonly viewId: ViewId) { super(`Unknown view: ${viewId}`); }
}

export class DuplicateBlockInstanceIdError extends Error {
  readonly kind = "duplicate-block-instance-id" as const;
  constructor(public readonly viewId: ViewId, public readonly blockId: BlockInstanceId) { ... }
}

export class UnknownViewBlockKeyError extends Error {
  readonly kind = "unknown-view-block-key" as const;
  constructor(public readonly key: string) { ... }
}

export class InvalidViewBlockConfigError extends Error {
  readonly kind = "invalid-view-block-config" as const;
  constructor(
    public readonly viewId: ViewId,
    public readonly blockId: BlockInstanceId,
    public readonly key: string,
    public readonly issues: readonly v.BaseIssue<unknown>[],
  ) { ... }
}

export class InvalidViewNameError extends Error {
  readonly kind = "invalid-view-name" as const;
  constructor(public readonly attemptedName: string) { ... }
}

export type ViewsLifecycleError = InvalidViewNameError;
```

All error classes live in `errors.ts` per [[feedback_errors_in_errors_ts]]; never inline at the consumer.

`UnknownViewBlockKeyError` and `InvalidViewBlockConfigError` are logging-only — the render path swallows them silently; the user sees the broken row vanish and the dev sees the error in the project logger. `UnknownViewError` and `ViewsLifecycleError` flow through `AsyncResult` to service callers.

No `ViewsLifecycleFlowError` / `toFlowError` in foundation. The flow-error wrapper lands when a flow consumes the service (future PR with settings UI). For foundation, service callers are tests; raw `AsyncResult<_, ViewsLifecycleError>` is enough.

### DI module

```ts
// src/views/module.ts
export const viewsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(viewsCollection);
    c.register(ViewsEventsToken).useFactory(() => createNanoEvents<ViewsEvents>());
    c.register(ViewsRepository).useClass(ViewsRepository).eager();
    c.register(ViewsService).useClass(ViewsService).eager();
    c.register(ViewHostService).useClass(ViewHostService).eager();
  },
};
```

Zero-arg `const` per [[feedback_di_module_factories]]. All three services `.eager()` so they're resolved at `container.autoLoad()` time in `main.ts`. `Container` lifetime is the default — never spelled out per [[feedback_di_omit_default_lifetime]]. The `ViewBlockDefinitionToken` multi-binding registers nothing in foundation; block modules will register their definitions in their own modules later.

`src/main.ts` adds one line: `container.addModule(viewsModule);` after `shelvesModule` and before `codeBlocksModule`.

## Testing

Per-file `.test.ts` colocated with implementation per [[feedback_test_hygiene]].

| File                   | Asserts                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.test.ts`       | seed-on-empty produces a valid view; invalid name / icon / blocks fail parse                                                                                                                                                                                                                                                                                                                         |
| `repository.test.ts`   | `get(unknown)` → `None`; `list()` is reactive; mutations through service surface in `list()` results                                                                                                                                                                                                                                                                                                 |
| `service.test.ts`      | every mutation emits the right event (`created`, `deleted`, `updated`); `create` returns Ok(ViewId); `clone` deep-copies blocks with fresh instance ids; `update` patches partials; `delete` then `delete` again returns `UnknownViewError`; `addBlock` rejects unknown key; `moveBlockUp` at index 0 is Ok no-op; `moveBlockDown` at last index is Ok no-op; `updateBlockConfig` rejects bad config |
| `view-context.test.ts` | `provideViewContext` exposes reactive `refDate` / `shelf`; setters update both; `useViewContext` outside a provider throws                                                                                                                                                                                                                                                                           |
| `view-host.test.ts`    | `register` calls `plugin.registerView` once + adds command + conditionally adds ribbon; `created` event triggers `register`; `updated` re-syncs command label without re-registering the view type; `deleted` invokes Disposer (detach all leaves of that viewType + remove command + remove ribbon); service `dispose()` cascades through every per-view Disposer                                   |
| `view-leaf.test.ts`    | leaf state defaults: missing `refDate` → today; missing `shelf` → `view.defaultShelf`; setters persist via mock `requestSaveLayout`; root renders placeholder when view is None; unknown block keys + invalid block configs are silently skipped (with log assertion)                                                                                                                                |

No tests for: the `viewsModule` shape, barrel exports, `ViewBlockDefinitionToken` registration mechanics, framework reactivity (per [[feedback_no_wiring_tests]] + [[feedback_no_trivial_tests]]).

Component-style tests use `@testing-library/vue` + `provideViewContextStub` per [[feedback_testing_library_for_components]].

### Testing helpers (`testing.ts`)

```ts
export function fakeViewsRepo(views: Record<ViewId, View> = {}): ViewsRepository;

export function provideViewContextStub(partial?: Partial<ViewContext>): ViewContext;

export function mountViewBlock<TConfig>(
  definition: ViewBlockDefinition<TConfig>,
  props: { instanceId?: BlockInstanceId; config?: TConfig },
  ctx?: Partial<ViewContext>,
): RenderResult;
```

Sibling layout per [[feedback_testing_dir_layout]]. Exported through a separate `src/views/testing.ts` barrel, not through `index.ts`, per [[feedback_barrel_files]].
