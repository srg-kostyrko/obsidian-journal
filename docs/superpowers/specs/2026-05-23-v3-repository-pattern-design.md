# v3 Repository Pattern — Design

## Goal

Introduce a Repository pattern as the canonical domain API for keyed,
persisted entities. The repository sits between `SettingsService` (which
owns hydration, reactivity, and persistence) and feature code (which today
mixes lifecycle services, direct `entries[id]` mutation, and `watch()`-driven
reconciliation). After this change, every mutation to a persisted entity
goes through the entity's repository, every cross-feature reaction subscribes
to that repository's events, and Vue components bind through a per-entity
view-model.

The three current persisted collections — journals, commands, shelves — all
adopt the pattern in a single branch. Lifecycle services and
`SettingsService.getCollection` are deleted in the same change. No
transitional state.

## Scope

In scope:

- A new infrastructure slice at `src/infrastructure/repository/` providing
  `BaseRepository`, `RepositoryQuery`, and the shared types.
- `SettingsService.recordOf(definition)` — typed reactive Record accessor
  that replaces `getCollection(definition)`.
- `JournalsRepository`, `CommandsRepository`, `ShelvesRepository` — concrete
  repositories owning CRUD + entity-specific factories (`create(...)`) and,
  for journals and shelves, `rename(old, new)`.
- `JournalsViewModel`, `CommandsViewModel`, `ShelvesViewModel` — DI-bound
  classes exposing reactive computed accessors and UI helpers, injected by
  Vue components via `useService(...)`.
- `ShelvesService` — small per-feature service owning the cascade
  subscribers (react to journal `renamed`/`deleted`) and the cross-feature
  `assign(journalName, shelfName)` operation.
- Per-entity events DI tokens (`JournalsEventsToken`, `CommandsEventsToken`,
  `ShelvesEventsToken`) so subscribers depend on the events emitter
  directly, not on the repository class.
- Migrating every consumer: modals, `DynamicCommandRegistry`'s
  `watch()`-based reconciliation, settings dashboards.
- Deleting `src/journals/settings/lifecycle.ts`,
  `src/shelves/lifecycle.ts`, `SettingsService.getCollection`, and
  `ReactiveCollection`'s mutation API (`add`/`remove`/`get`).

Out of scope:

- `JournalsIndex` (`src/journals/journals-index.ts`). It is a vault-backed
  dual-keyed in-memory index, not a flat `Record<Id, Entity>`. Its API,
  events, and storage stay untouched.
- The `calendar` settings slice. Slices are not collections; the repository
  pattern applies only to collections.
- Settings persistence orchestration. `SettingsService` keeps its
  debounced `watch(this.#root, ...)` save loop — that is render-adjacent
  persistence, not cross-feature derivation.
- Any change to v2→v3 migration code or stored data shape. The on-disk
  format is unchanged.
- A code-generation/hygen template for new repositories. With three
  concrete repositories the boilerplate is bounded; revisit if a fourth is
  added.

## Background — current state

Three collections are defined via `defineCollection` in `src/settings/`:

- `journalConfigCollection` (`src/journals/config.ts`).
- `commandCollection` (`src/commands/config.ts`).
- `shelvesCollection` (`src/shelves/config.ts`).

`SettingsService` hydrates each collection into a reactive
`Record<id, Entity>` and exposes it via `getCollection(definition)`, which
returns a `CollectionHandle` with `add(id, init?)`, `remove(id)`,
`get(id)`, and a readonly `entries`.

Two lifecycle services already act as hand-rolled, half-formed
repositories:

- `JournalLifecycleService` (`src/journals/settings/lifecycle.ts`) owns
  `create(name, write)`, `rename(old, new)`, `delete(name)`, and emits
  typed `journalRenamed` / `journalDeleted` events.
- `ShelvesLifecycleService` (`src/shelves/lifecycle.ts`) owns
  `create(name)`, `rename(old, new)`, `delete(name, destinationShelf?)`,
  `assign(journalName, shelfName)`, emits `shelfRenamed` / `shelfDeleted`,
  and subscribes to `JournalLifecycleService.events` to keep shelf
  membership consistent on journal renames and deletions.

There is no repository for `commandCollection`. `DynamicCommandRegistry`
reconciles registered commands by `watch()`-ing the reactive entries
(`src/commands/command-registry.ts:42`, `flush: "sync"`).

Field-level mutation of `entries[id]` is the de facto write path in
several places (e.g. `command.target.journalName = newName` in
`DynamicCommandRegistry#onJournalRenamed`). There is no event channel for
"a command's fields changed" except the `watch()`.

## Architecture decisions

The decisions below are the outputs of the design interview that produced
this document. Each is briefly stated with its rationale; the components
section operationalises them.

**Layering: repository over `ReactiveCollection`, not in place of it.**
The repository's `storage` getter resolves through `SettingsService` to the
existing reactive Record. Settings hydration, parsing, and persistence are
unchanged.

**Mutations: repository owns writes; `watch()` reserved for render and
persistence.** No cross-feature logic listens via `watch`. Field-level
direct mutation of `entries[id]` is banned outside the repository.

**`rename` lives on subclasses, not the base.** `name` is identity for
journals and shelves; renaming is a destroy-and-recreate at the keyed
storage level. The base must not model this. Subclasses that need it (the
journal and shelf repositories) declare it and emit a typed `renamed`
event in addition to the generic ones.

**Per-entity typed errors.** Errors are entity-specific
(`JournalNameTakenError`, etc.). The base's interface is parameterised on
the error type `E`; concrete repositories bind their own error classes.
This matches v3's `errors.ts`-per-feature convention.

**Repository writes directly to the reactive Record.**
`ReactiveCollection`'s `add`/`remove`/`get` are deleted. Defaults merging
(currently `init?: Partial<T>` on `collection.add`) moves into each
subclass's `create(...)` factory.

**`SettingsService.getCollection` is removed.** Read access for callers
that need the live reactive Record (Vue templates that iterate, the
repository itself) goes through `recordOf(definition)`. Mutation has no
direct path — callers go through the repository.

**View-model per entity, accessed via `useService(...)`.** No
per-feature composable wrappers (no `useJournalsViewModel()`). The view-
model holds Vue `computed` arrays + UI helpers like
`isJournalNameAvailable`.

**Events: separate DI token per entity.** Subscribers inject the events
emitter directly, never the repository, when they only react. The
repository receives the emitter as a field, not a getter.

**Per-feature service class only where cross-feature behaviour exists.**
`ShelvesService` holds the cascade subscribers and `assign(...)`.
`JournalsRepository` and `CommandsRepository` have no peer service — no
cross-feature behaviour they own.

**Base API surface.** Public: `count`, `find`, `exists`, `get`, `update`,
`delete`. Protected: `add` (used only by subclass factories). `update`
rejects changes to the id key; subclasses use `rename` for identity
changes. `rename` itself is not on the base.

## Component 1 — `BaseRepository`

Location: `src/infrastructure/repository/base-repository.ts`.

```ts
export interface RepositoryEvents<Id extends string, Entity> {
  created: (id: Id) => void;
  updated: (id: Id, changes: Partial<Entity>) => void;
  deleted: (id: Id) => void;
}

export abstract class BaseRepository<
  Id extends string,
  Entity,
  EUnknown extends Error,
  EInvalidUpdate extends Error,
  Q extends RepositoryQuery<Id, Entity> = RepositoryQuery<Id, Entity>,
  E extends RepositoryEvents<Id, Entity> = RepositoryEvents<Id, Entity>,
> {
  protected abstract idKey: keyof Entity;
  protected abstract nameKey?: keyof Entity;
  protected abstract QueryConstructor: new (
    source: IterableIterator<Entity>,
    idKey: keyof Entity,
    nameKey?: keyof Entity,
  ) => Q;
  protected abstract storage: Record<Id, Entity>;
  protected abstract events: Emitter<E>;
  protected abstract unknownEntityError: (id: Id) => EUnknown;
  protected abstract invalidUpdateError: (id: Id, changes: Partial<Entity>) => EInvalidUpdate;

  count(): number;
  exists(id: Id): boolean;
  get(id: Id): Option<Entity>;
  find(): Q;
  update(id: Id, changes: Partial<Entity>): Result<void, EUnknown | EInvalidUpdate>;
  delete(id: Id): Result<void, EUnknown>;

  protected add(entity: Entity): Result<Id, EUnknown>; // see note in §"Add semantics"
}
```

### Abstract members

- `idKey` and `nameKey`. Mirror v3-dev's contract. `idKey` is the entity
  field that is the storage key. `nameKey` defaults to the same field and
  feeds `RepositoryQuery.options()` labels.
- `QueryConstructor`. Lets subclasses substitute a specialised query
  class. Most repositories use the default
  `RepositoryQuery`.
- `storage` and `events`. Both are **fields**, set via `inject(...)` at
  field initialisation in the subclass. The base sees them only via
  protected abstract declarations; it does not call `inject()`. The
  storage field's initialiser uses
  `inject(SettingsService).recordOf(definition)`; the events field's
  initialiser is `inject(EntityEventsToken)`.
- `unknownEntityError(id)` and `invalidUpdateError(id, changes)`. Two
  abstract methods that produce the typed errors `update` and `delete`
  must return. Subclasses bind them to the feature's own error classes.
  This keeps every error declared in the feature's `errors.ts` — no
  shared generic errors at the base.

### Method semantics

- `count(): number` — `Object.keys(this.storage).length`.
- `exists(id): boolean` — `id in this.storage`.
- `get(id): Option<Entity>` — `Option.fromNullable(this.storage[id])`.
- `find(): Q` — `new this.QueryConstructor(Object.values(this.storage)[Symbol.iterator]() as IterableIterator<Entity>, this.idKey, this.nameKey)`.
- `update(id, changes): Result<void, EUnknown | EInvalidUpdate>` —
  - If `!(id in this.storage)`, return `Err(this.unknownEntityError(id))`.
  - If `this.idKey in changes` and `changes[this.idKey] !== id`, return
    `Err(this.invalidUpdateError(id, changes))`. Subclasses provide
    `rename` for identity changes.
  - Otherwise `this.storage[id] = { ...this.storage[id], ...changes }`,
    emit `updated(id, changes)`, return `Ok(undefined)`.
- `delete(id): Result<void, EUnknown>` —
  - If `!(id in this.storage)`, return `Err(this.unknownEntityError(id))`.
  - Otherwise `delete this.storage[id]`, emit `deleted(id)`, return
    `Ok(undefined)`.
- `protected add(entity): Result<Id, EUnknown>` — used by subclass
  factories. Extracts `id = entity[this.idKey] as Id`. If `id in
this.storage`, returns `Err(this.unknownEntityError(id))` — but
  subclass `create()` factories normally check this before calling `add`,
  returning a more specific `*NameTakenError`. `add` is the low-level
  insert; the duplicate check on it exists as a safety net.

### Add semantics

`add` is protected, not public. Domain code calling
`journalsRepo.create(name, write)` does not need to know how an entity is
assembled from defaults; the subclass factory does. Tests that want to
seed the storage directly use the storage field via the repository's own
test helpers (see §Testing), not by calling `add`.

### Generic parameters and error binding

The base is generic in:

- `Id extends string` — the storage key type. In current collections this
  is just `string`, but new branded id types (e.g. `JournalName extends
Brand<string, "JournalName">`) can be introduced later without
  touching the base.
- `Entity` — the entry value type.
- `EUnknown extends Error` — the error class returned for unknown ids.
- `EInvalidUpdate extends Error` — the error class returned when
  `update` is called with an id-key change.
- `Q extends RepositoryQuery<Id, Entity>` — the query class.
- `E extends RepositoryEvents<Id, Entity>` — the events interface.

The two error generics let `update` and `delete` return precisely typed
`Result<void, E1 | E2>` without a base-owned error family.

## Component 2 — `RepositoryQuery`

Location: `src/infrastructure/repository/repository-query.ts`.

```ts
export interface RepositoryQueryContract<Id extends string, Entity> {
  first(): Option<Entity>;
  ids(): IterableIterator<Id>;
  list(): IterableIterator<Entity>;
  options(): IterableIterator<{ value: Id; label: string }>;
  map<T>(fn: (entity: Entity) => T): IterableIterator<T>;
  filter(predicate: (entity: Entity) => boolean): this;
  [Symbol.iterator](): Iterator<Entity>;
}

export class RepositoryQuery<Id extends string, Entity>
  implements RepositoryQueryContract<Id, Entity>
{
  constructor(
    protected source: IterableIterator<Entity>,
    protected idKey: keyof Entity,
    protected nameKey?: keyof Entity,
  );
  // method bodies as in v3-dev's repository-query.ts
}
```

Semantics match v3-dev's reference implementation:

- `first()` consumes one element of the source via `source.next()` and
  wraps in `Option.fromNullable`.
- `ids()`, `list()`, `options()`, `map()` are lazy iterators over the
  source.
- `filter(predicate)` returns a new instance of the **same concrete
  class** (via `new (this.constructor as ...)(...)`), so subclassed
  queries chain correctly.
- `options()` labels with `entity[nameKey]` if `nameKey` is set, else
  `entity[idKey]`.

### Subclassed queries

No specialised query subclass is introduced in this change. Each concrete
repository uses the default `RepositoryQuery`. The `QueryConstructor`
abstract member exists so a future repository can specialise without
touching the base.

### Usage rule

`RepositoryQuery` is one-shot. Each `repo.find()` returns a fresh
instance over a fresh iteration of `storage`. Inside a Vue `computed`,
**call `find()` inside the computed, not outside**, so re-running the
computed re-iterates the reactive Record. The view-models in this design
follow this rule.

## Component 3 — `SettingsService.recordOf`

`SettingsService` (`src/settings/settings-service.ts`) gains one new
public method and loses `getCollection`:

```ts
recordOf<TKey extends string, TItem extends AnySchema>(
  collection: CollectionDefinition<TKey, TItem>,
): Record<string, InferOutput<TItem>>;
```

Semantics:

- Returns the reactive Record stored at `this.#root[collection.key]`.
  This Record is the same object hydrated by `ReactiveCollection` —
  parse-on-load, default-on-error behaviour is unchanged.
- Throws `UnregisteredSliceError` (existing class) if the collection key
  was not registered.
- Returned reference is stable for the lifetime of the
  `SettingsService` instance. Repositories cache it on a field.

`SettingsService.getCollection` is **removed**. `ReactiveCollection`'s
`add`, `remove`, and `get` methods become unused and are also removed; the
class is renamed to `ReactiveCollectionStore` and shrinks to
hydration-only responsibility (constructor parses raw values into the
Record, no public mutation API). It remains internal to
`src/settings/`. The `CollectionHandle` type in `src/settings/types.ts`
is deleted.

## Component 4 — `JournalsRepository`

Location: `src/journals/repository.ts`.

```ts
export interface JournalsEvents extends RepositoryEvents<string, JournalConfig> {
  renamed: (oldName: string, newName: string) => void;
}

export class JournalsRepository extends BaseRepository<
  string,
  JournalConfig,
  UnknownJournalError,
  InvalidJournalUpdateError,
  RepositoryQuery<string, JournalConfig>,
  JournalsEvents
> {
  protected idKey = "name" as const;
  protected nameKey = "name" as const;
  protected QueryConstructor = RepositoryQuery;
  protected storage = inject(SettingsService).recordOf(journalConfigCollection);
  protected events = inject(JournalsEventsToken);
  protected unknownEntityError = (name: string) => new UnknownJournalError(name);
  protected invalidUpdateError = (name: string, _changes: Partial<JournalConfig>) =>
    new InvalidJournalUpdateError(name);

  create(name: string, write: JournalWrite): Result<JournalConfig, InvalidJournalNameError | JournalNameTakenError>;

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownJournalError | InvalidJournalNameError | JournalNameTakenError>;
}
```

### `create(name, write)`

Replaces `JournalLifecycleService.create`. Identical semantics:

- Reject empty `name` with `InvalidJournalNameError`.
- Reject a name already in storage with `JournalNameTakenError`.
- Otherwise build `journalDefaultsFor(write, name)`, call
  `this.add(entity)`, return the inserted entity. `add`'s `Err` path here
  is unreachable because the name-taken check already ran; if it ever
  fires (race / programming error), it surfaces as the same
  `UnknownJournalError` shape but treated as an invariant violation by
  tests.

### `rename(oldName, newName)`

Replaces `JournalLifecycleService.rename`. Atomic delete-and-create at the
storage level, emits **one** typed `renamed` event (no intermediate
`deleted`/`created`):

- Reject empty `newName` or `newName === oldName` with
  `InvalidJournalNameError`.
- Reject unknown `oldName` with `UnknownJournalError`.
- Reject `newName` already in storage with `JournalNameTakenError`.
- Otherwise mutate the entity's `name` field, `delete
this.storage[oldName]`, set `this.storage[newName] = entity`, emit
  `renamed(oldName, newName)`.

Crucially, `renamed` is the **only** event for a rename — no
`created`/`deleted` pair fires. Subscribers that only need the lifecycle
(e.g. `DynamicCommandRegistry`'s reconciliation listener for commands)
must subscribe to `renamed` separately when they care about rename
semantics. The base's generic `created`/`updated`/`deleted` are emitted
only by `create`/`update`/`delete`.

### `update`

Inherited unchanged. Rejects changes to `name` via
`InvalidJournalUpdateError` (a new class in `src/journals/errors.ts`).
Callers wanting to change `name` must call `rename` instead.

## Component 5 — `JournalsViewModel`

Location: `src/journals/view-model.ts`. Eager DI binding via `autoLoad`.

```ts
export class JournalsViewModel {
  readonly #repository = inject(JournalsRepository);

  readonly journals = computed(() => [...this.#repository.find().list()]);
  readonly journalOptions = computed(() => [...this.#repository.find().options()]);
  readonly journalCount = computed(() => this.#repository.count());

  getJournal(name: string): Option<JournalConfig> {
    return this.#repository.get(name);
  }

  isJournalNameAvailable(name: string, excludeCurrent?: string): boolean {
    if (excludeCurrent && name === excludeCurrent) return true;
    return this.#repository.get(name).isNone();
  }
}
```

Vue components inject this via `useService(JournalsViewModel)` — the
generic v3-ai pattern. No per-feature composable wrapper.

## Component 6 — `CommandsRepository`

Location: `src/commands/repository.ts`.

```ts
export interface CommandsEvents extends RepositoryEvents<string, CommandConfig> {}

export class CommandsRepository extends BaseRepository<
  string,
  CommandConfig,
  UnknownCommandError,
  InvalidCommandUpdateError,
  RepositoryQuery<string, CommandConfig>,
  CommandsEvents
> {
  protected idKey = "id" as const;
  protected nameKey = "name" as const;
  protected QueryConstructor = RepositoryQuery;
  protected storage = inject(SettingsService).recordOf(commandCollection);
  protected events = inject(CommandsEventsToken);
  protected unknownEntityError = (id: string) => new UnknownCommandError(id);
  protected invalidUpdateError = (id: string) => new InvalidCommandUpdateError(id);

  create(id: string, init: CommandConfig): Result<CommandConfig, CommandIdTakenError>;
}
```

Commands are keyed by `id` (a generated string), separate from the
`name` field. There is no `rename(old, new)` — the id is immutable; the
display name changes via the inherited `update(id, { name })`.

`create(id, init)` performs the duplicate-id check and calls
`this.add(init)`. The defaults factory `commandCollection.defaultItem(id)`
is unused by `create` because the UI always supplies a fully-formed
config; tests that want a default may call
`commandCollection.defaultItem(id)` first and pass the result in.

`CommandsEvents` extends the base events without additions — there is no
typed semantic event for commands beyond the generic ones.

## Component 7 — `CommandsViewModel`

Location: `src/commands/view-model.ts`. Same shape as
`JournalsViewModel`:

```ts
export class CommandsViewModel {
  readonly #repository = inject(CommandsRepository);
  readonly commands = computed(() => [...this.#repository.find().list()]);
  readonly commandCount = computed(() => this.#repository.count());

  getCommand(id: string): Option<CommandConfig> {
    return this.#repository.get(id);
  }
}
```

## Component 8 — `ShelvesRepository`

Location: `src/shelves/repository.ts`.

```ts
export interface ShelvesEvents extends RepositoryEvents<string, ShelfConfig> {
  renamed: (oldName: string, newName: string) => void;
}

export class ShelvesRepository extends BaseRepository<
  string,
  ShelfConfig,
  UnknownShelfError,
  InvalidShelfUpdateError,
  RepositoryQuery<string, ShelfConfig>,
  ShelvesEvents
> {
  protected idKey = "name" as const;
  protected nameKey = "name" as const;
  protected QueryConstructor = RepositoryQuery;
  protected storage = inject(SettingsService).recordOf(shelvesCollection);
  protected events = inject(ShelvesEventsToken);
  protected unknownEntityError = (name: string) => new UnknownShelfError(name);
  protected invalidUpdateError = (name: string) => new InvalidShelfUpdateError(name);

  create(name: string): Result<ShelfConfig, InvalidShelfNameError | ShelfNameTakenError>;

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownShelfError | InvalidShelfNameError | ShelfNameTakenError>;

  deleteWith(name: string, destinationShelf?: string): Result<void, UnknownShelfError>;
}
```

### `create(name)` and `rename(oldName, newName)`

Replace the equivalent methods on `ShelvesLifecycleService`. Same
validation semantics; emit `created` / `renamed` on the
`ShelvesEventsToken` emitter. `rename` mutates the entity's `name` field
and swaps keys atomically.

### `deleteWith(name, destinationShelf?)`

`ShelvesLifecycleService.delete(name, destination?)` had a second
argument that moves member journals to a destination shelf before
removing the entry. That logic is shelf-specific and cannot live on the
base's `delete`. It moves to a sibling method **on the repository**
because it is still a same-entity operation (it touches only shelves):

- Reject unknown `name` with `UnknownShelfError`.
- Reject provided-but-unknown `destinationShelf` with
  `UnknownShelfError`.
- With destination: append the source shelf's `journals` to the
  destination shelf's `journals`, then `delete this.storage[name]`, emit
  `deleted(name)`.
- Without destination: just `delete this.storage[name]`, emit
  `deleted(name)`. The member journals become unassigned — their journal
  configs are untouched. Same behaviour as today.

The base's `delete(name)` is also inherited and still works for plain
deletion. `deleteWith` is the extended form callers use when a
destination might be specified.

## Component 9 — `ShelvesViewModel`

Location: `src/shelves/view-model.ts`. Same shape as the others:

```ts
export class ShelvesViewModel {
  readonly #repository = inject(ShelvesRepository);
  readonly shelves = computed(() => [...this.#repository.find().list()]);
  readonly shelfOptions = computed(() => [...this.#repository.find().options()]);
  readonly shelfCount = computed(() => this.#repository.count());

  getShelf(name: string): Option<ShelfConfig> {
    return this.#repository.get(name);
  }

  isShelfNameAvailable(name: string, excludeCurrent?: string): boolean {
    if (excludeCurrent && name === excludeCurrent) return true;
    return this.#repository.get(name).isNone();
  }
}
```

## Component 10 — `ShelvesService`

Location: `src/shelves/service.ts`. Eager DI binding via `autoLoad`. The
only cross-feature class in this design.

```ts
export class ShelvesService {
  readonly #shelves = inject(ShelvesRepository);
  readonly #journals = inject(JournalsRepository);
  readonly #journalEvents = inject(JournalsEventsToken);

  constructor() {
    this.#journalEvents.on("renamed", (oldName, newName) => {
      this.#renameJournalInShelves(oldName, newName);
    });
    this.#journalEvents.on("deleted", (journalName) => {
      this.#removeJournalFromShelves(journalName);
    });
  }

  assign(journalName: string, shelfName: string): Result<void, UnknownJournalError | UnknownShelfError>;

  #renameJournalInShelves(oldName: string, newName: string): void;
  #removeJournalFromShelves(journalName: string): void;
}
```

### `assign(journalName, shelfName)`

Identical semantics to today's `ShelvesLifecycleService.assign`:

- Reject unknown `journalName` (looked up via `this.#journals.get(name)`)
  with `UnknownJournalError`.
- `shelfName === ""` means unassign: call `#removeJournalFromShelves` and
  return `Ok(undefined)`. No error.
- Otherwise reject unknown `shelfName` with `UnknownShelfError`, then
  call `#removeJournalFromShelves(journalName)` (enforces single-shelf
  membership) and push `journalName` onto the target shelf's `journals`
  via `this.#shelves.update(shelfName, { journals: [...target.journals, journalName] })`.

The validation lookup on `this.#journals.get(name)` is the **only**
ongoing reference `ShelvesService` makes to `JournalsRepository` — all
cascade logic uses the events token alone.

### Cascade implementations

The private methods iterate `this.#shelves.find()` and call
`this.#shelves.update(shelf.name, { journals: ... })` for each affected
shelf — no direct mutation of `storage` from outside the repository.

```ts
#renameJournalInShelves(oldName: string, newName: string): void {
  for (const shelf of this.#shelves.find().list()) {
    const idx = shelf.journals.indexOf(oldName);
    if (idx !== -1) {
      const journals = [...shelf.journals];
      journals[idx] = newName;
      this.#shelves.update(shelf.name, { journals });
    }
  }
}

#removeJournalFromShelves(journalName: string): void {
  for (const shelf of this.#shelves.find().list()) {
    const idx = shelf.journals.indexOf(journalName);
    if (idx !== -1) {
      const journals = shelf.journals.filter((j) => j !== journalName);
      this.#shelves.update(shelf.name, { journals });
    }
  }
}
```

Each `update` call emits a separate `updated` event on
`ShelvesEventsToken`. Subscribers that care only about renames vs.
unrelated updates filter by inspecting `changes` (`"journals" in
changes`).

## Component 11 — events tokens

Three new DI tokens, each a `token<Emitter<...Events>>`. Each is bound to
a singleton `createNanoEvents<...Events>()` in the feature's module.

`src/journals/tokens.ts`:

```ts
export const JournalsEventsToken = token<Emitter<JournalsEvents>>("JournalsEvents");
```

`src/commands/tokens.ts`:

```ts
export const CommandsEventsToken = token<Emitter<CommandsEvents>>("CommandsEvents");
```

`src/shelves/tokens.ts`:

```ts
export const ShelvesEventsToken = token<Emitter<ShelvesEvents>>("ShelvesEvents");
```

(Exact `token(...)` factory call matches the v3 DI convention used by the
existing `SliceDefinitionToken` / `CollectionDefinitionToken` /
`MigrationToken` in `src/settings/tokens.ts`.)

## Component 12 — errors

Each feature's `errors.ts` gains one new class for `invalidUpdateError`,
keeping the existing classes:

- `src/journals/errors.ts`: existing `InvalidJournalNameError`,
  `JournalNameTakenError`, `UnknownJournalError`, **new**
  `InvalidJournalUpdateError(name: string)`.
- `src/commands/errors.ts`: **new** file. `CommandIdTakenError(id:
string)`, `UnknownCommandError(id: string)`,
  `InvalidCommandUpdateError(id: string)`. Today there is no
  `commands/errors.ts`; this design adds one.
- `src/shelves/errors.ts`: existing `InvalidShelfNameError`,
  `ShelfNameTakenError`, `UnknownShelfError`, **new**
  `InvalidShelfUpdateError(name: string)`.

All error classes follow the existing pattern (extend `Error`, set
`this.name`, store the identifying field).

## Component 13 — module wiring

Each feature module gains the repository, view-model, events token
binding, and (for shelves) the service.

`src/journals/module.ts` — adds:

- `JournalsEventsToken → createNanoEvents<JournalsEvents>()` singleton.
- `JournalsRepository → JournalsRepository` (eager via autoLoad — so its
  `inject` field initialisers run at boot and storage is wired).
- `JournalsViewModel → JournalsViewModel` (eager).

Removes:

- The `JournalLifecycleService` binding.

`src/commands/module.ts` — adds:

- `CommandsEventsToken → createNanoEvents<CommandsEvents>()` singleton.
- `CommandsRepository → CommandsRepository` (eager).
- `CommandsViewModel → CommandsViewModel` (eager).

`src/shelves/module.ts` — adds:

- `ShelvesEventsToken → createNanoEvents<ShelvesEvents>()` singleton.
- `ShelvesRepository → ShelvesRepository` (eager).
- `ShelvesViewModel → ShelvesViewModel` (eager).
- `ShelvesService → ShelvesService` (eager — so its constructor's
  cascade subscriptions are live from boot).

Removes:

- The `ShelvesLifecycleService` binding.

Lifetimes are omitted at all three binding sites (Container is the
default per the project's DI conventions).

`main.ts` is unchanged — it already adds these modules; only the
contents of each module change.

## Migration of consumers

Three call-site clusters change.

### `DynamicCommandRegistry` (`src/commands/command-registry.ts`)

- The `watch(this.#commandEntries(), () => this.#reconcile(), { deep: true, flush: "sync" })` on line 42 is replaced by three subscriptions:

  ```ts
  this.#commandsEvents.on("created", () => this.#reconcile());
  this.#commandsEvents.on("updated", () => this.#reconcile());
  this.#commandsEvents.on("deleted", () => this.#reconcile());
  ```

  The `#reconcile()` body still reads the latest entries via
  `this.#commandsRepo.find().list()` rather than `this.#commandEntries()`.

- `#onJournalRenamed(oldName, newName)` and `#onJournalDeleted(journalName)`
  re-subscribe to `JournalsEventsToken.on("renamed", ...)` and
  `JournalsEventsToken.on("deleted", ...)` (replacing
  `JournalLifecycleService.events.on("journalRenamed", ...)` etc.). The
  bodies become repository-mediated:

  ```ts
  for (const command of this.#commandsRepo.find().list()) {
    if (command.target.kind === "journal" && command.target.journalName === oldName) {
      this.#commandsRepo.update(command.id, {
        target: { ...command.target, journalName: newName },
      });
    }
  }
  ```

  No direct field mutation on `command.target.journalName`.

- The same pattern applies to `#onShelfRenamed` / `#onShelfDeleted`
  against `ShelvesEventsToken`.

- The `JournalsIndex` dependency stays — that index is untouched by this
  design.

### Modals and settings dashboards

Every callsite that today does
`inject(SettingsService).getCollection(definition).{add,remove,get}` or
`getCollection(definition).entries` migrates:

- Mutation calls → repository methods. `journalLifecycle.rename(old,
new)` becomes `journalsRepo.rename(old, new)`; `collection.add(name,
init)` becomes `journalsRepo.create(name, write)` (or the
  command/shelf equivalent).
- Read iteration → view-model accessors. `Object.entries(collection.entries)`
  in Vue templates becomes `journalsViewModel.journals` (the
  `ComputedRef<JournalConfig[]>`).
- Existence checks → view-model `isXxxNameAvailable`.

A full audit list lives in the implementation plan, not here.

### Lifecycle service deletions

After all consumers are migrated:

- `src/journals/settings/lifecycle.ts` is deleted along with its
  `.test.ts`.
- `src/shelves/lifecycle.ts` is deleted along with its `.test.ts`.

`src/journals/settings/errors.ts` is **kept** — its classes are reused by
the repository. Same for `src/shelves/errors.ts`.

The `settings/` subdirectory under `journals/` keeps its remaining
contents (UI components). It's no longer the home of a lifecycle service.

## Testing

### Base repository tests

Location: `src/infrastructure/repository/base-repository.test.ts`. A small
concrete subclass (defined inside the test file's `testing.ts` sibling)
exercises the abstract surface:

- `count`, `exists`, `get` against a populated record.
- `find().list()` iterates all entries; `find().filter(...).list()` chains.
- `find().options()` labels by `nameKey`.
- `update(id, changes)` mutates and emits `updated`.
- `update(id, { [idKey]: other })` returns `InvalidUpdateError` and emits
  nothing.
- `update(unknownId, ...)` returns `UnknownEntityError` and emits nothing.
- `delete(id)` removes and emits `deleted`.
- `delete(unknownId, ...)` returns `UnknownEntityError` and emits nothing.
- `add(entity)` inserts and emits `created`.
- `add(entity)` with a duplicate id returns `UnknownEntityError` (the
  base's add-guard fallback; subclass `create` is what produces
  `*NameTakenError`).

Tests wire a real `createNanoEvents<...>()` (per memory
`feedback_no_mock_fake_tests`: no fake repository). Storage is a plain
`{}` literal — Vue reactivity is not required at this layer.

### Subclass tests

- `src/journals/repository.test.ts` — covers `create`, `rename`, the
  inherited `update`/`delete` with journal-specific errors. Wires a real
  events token and a real reactive Record built from
  `SettingsService.recordOf` in a settings test harness.
- `src/commands/repository.test.ts` — covers `create`, the inherited
  surface with command-specific errors.
- `src/shelves/repository.test.ts` — covers `create`, `rename`,
  `deleteWith` with and without destination, the inherited surface with
  shelf-specific errors.

Each subclass test exercises both the success path and every typed-error
path. One behaviour per test (memory `feedback_one_behavior_per_test`),
nested `describe()` blocks for scope (memory `feedback_nested_describes`).

### View-model tests

`src/journals/view-model.test.ts`, `src/commands/view-model.test.ts`,
`src/shelves/view-model.test.ts`. Each:

- Builds a real repository on top of a populated record + real events
  emitter.
- Asserts `journals`/`commands`/`shelves` `ComputedRef` reflects the
  current state and updates after a repository mutation.
- Asserts `isXxxNameAvailable` returns expected booleans, including the
  `excludeCurrent` case.
- Asserts `getXxx(name)` is `Option.none()` for unknowns and `Option.some(...)`
  for hits.

### Service tests

`src/shelves/service.test.ts`:

- `assign` success places the journal on the target shelf.
- `assign` moves a journal off its current shelf.
- `assign(name, "")` unassigns from every shelf.
- `assign` rejects unknown journal / unknown shelf with the right typed
  error.
- Cascade: renaming a journal via `journalsRepo.rename` updates every
  shelf's `journals` array.
- Cascade: deleting a journal via `journalsRepo.delete` removes its name
  from every shelf.

### Migrated consumer tests

`src/commands/command-registry.test.ts` — existing tests stay but their
setup migrates: instead of constructing a `JournalLifecycleService` to
trigger `journalRenamed`, the test uses `journalsRepo.rename(...)` and
subscribers receive the event via `JournalsEventsToken`. Existing
behaviour (registered commands react to renames/deletes) is unchanged.

### Things not tested directly

Per memory `feedback_no_wiring_tests`:

- The events token bindings (just shape).
- The module wiring.
- The `recordOf` accessor's return-shape (covered transitively by
  repository tests).
- Barrel exports.

Per memory `feedback_no_mock_fake_tests`, no test file mocks or fakes a
repository. Tests build real repositories over plain records and real
events emitters.

## Files touched — summary

Created:

- `src/infrastructure/repository/base-repository.ts`
- `src/infrastructure/repository/base-repository.test.ts`
- `src/infrastructure/repository/repository-query.ts`
- `src/infrastructure/repository/repository-query.test.ts`
- `src/infrastructure/repository/types.ts`
- `src/infrastructure/repository/index.ts`
- `src/journals/repository.ts`
- `src/journals/repository.test.ts`
- `src/journals/view-model.ts`
- `src/journals/view-model.test.ts`
- `src/journals/tokens.ts`
- `src/commands/repository.ts`
- `src/commands/repository.test.ts`
- `src/commands/view-model.ts`
- `src/commands/view-model.test.ts`
- `src/commands/tokens.ts`
- `src/commands/errors.ts`
- `src/shelves/repository.ts`
- `src/shelves/repository.test.ts`
- `src/shelves/view-model.ts`
- `src/shelves/view-model.test.ts`
- `src/shelves/service.ts`
- `src/shelves/service.test.ts`
- `src/shelves/tokens.ts`

Modified:

- `src/settings/settings-service.ts` (add `recordOf`, remove
  `getCollection`).
- `src/settings/collection.ts` (rename `ReactiveCollection` to
  `ReactiveCollectionStore`; remove `add`/`remove`/`get` methods).
- `src/settings/types.ts` (remove `CollectionHandle`).
- `src/settings/index.ts` (update exports).
- `src/journals/errors.ts` (add `InvalidJournalUpdateError`).
- `src/journals/module.ts` (bind events token, repository, view-model;
  drop `JournalLifecycleService`).
- `src/journals/index.ts` (update barrel — export
  `JournalsRepository`, `JournalsViewModel`, `JournalsEventsToken`;
  remove `JournalLifecycleService`).
- `src/commands/module.ts` (bind events token, repository, view-model).
- `src/commands/index.ts` (update barrel).
- `src/commands/command-registry.ts` (replace `watch` and lifecycle
  subscriptions with event-token subscriptions; mediate command field
  changes through `repo.update`).
- `src/shelves/errors.ts` (add `InvalidShelfUpdateError`).
- `src/shelves/module.ts` (bind events token, repository, view-model,
  service; drop `ShelvesLifecycleService`).
- `src/shelves/index.ts` (update barrel — export `ShelvesRepository`,
  `ShelvesViewModel`, `ShelvesService`, `ShelvesEventsToken`; remove
  `ShelvesLifecycleService`).
- Every Vue component and other consumer currently calling
  `settings.getCollection(...)` — full list in the implementation plan.

Deleted:

- `src/journals/settings/lifecycle.ts` and `.test.ts`.
- `src/shelves/lifecycle.ts` and `.test.ts`.
